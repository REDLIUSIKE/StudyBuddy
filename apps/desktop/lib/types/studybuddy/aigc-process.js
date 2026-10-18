/** The Windows supervisor contains the service and every descendant in one kill-on-close Job Object. */
import { spawn, execFile } from 'node:child_process';
import { join } from 'node:path';
const supervisor = String.raw `
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
public static class StudyBuddyAigcJob {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr data, uint size);
  [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll")] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting data, uint size, IntPtr returned);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [StructLayout(LayoutKind.Sequential)] struct Basic { public long processTime, jobTime; public uint flags; public UIntPtr min, max; public uint count; public UIntPtr affinity; public uint priority, scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct Io { public ulong read, write, other, readBytes, writeBytes, otherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct Limits { public Basic basic; public Io io; public UIntPtr processMemory, jobMemory, peakProcess, peakJob; }
  [StructLayout(LayoutKind.Sequential)] struct Accounting { public long user, kernel, periodUser, periodKernel; public uint faults, total, active, terminated; }
  static string Quote(string value) {
    var result = new StringBuilder("\""); int slashes = 0;
    foreach (char item in value) {
      if (item == '\\') { slashes++; continue; }
      if (item == '"') result.Append('\\', slashes * 2 + 1); else result.Append('\\', slashes);
      result.Append(item); slashes = 0;
    }
    result.Append('\\', slashes * 2); return result.Append('"').ToString();
  }
  static void Pump(Stream source, Stream target) {
    byte[] bytes = new byte[81920]; int count;
    while ((count = source.Read(bytes, 0, bytes.Length)) > 0) { target.Write(bytes, 0, count); target.Flush(); }
  }
  public static int Run(string executable, string[] args) {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) throw new Exception("AIGC_PROCESS_CONTAINMENT_FAILED");
    var limits = new Limits(); limits.basic.flags = 0x2000;
    IntPtr memory = Marshal.AllocHGlobal(Marshal.SizeOf(limits));
    try {
      Marshal.StructureToPtr(limits, memory, false);
      if (!SetInformationJobObject(job, 9, memory, (uint)Marshal.SizeOf(limits))) throw new Exception("AIGC_PROCESS_CONTAINMENT_FAILED");
      var start = new ProcessStartInfo(executable);
      start.Arguments = String.Join(" ", Array.ConvertAll(args, Quote));
      start.UseShellExecute = false; start.CreateNoWindow = true;
      start.RedirectStandardInput = true; start.RedirectStandardOutput = true; start.RedirectStandardError = true;
      var process = Process.Start(start);
      if (!AssignProcessToJobObject(job, process.Handle)) { process.Kill(); process.WaitForExit(); throw new Exception("AIGC_PROCESS_CONTAINMENT_FAILED"); }
      // The service waits for private stdin bootstrap, so assignment precedes all service work.
      Task.Run(() => { try { Pump(Console.OpenStandardInput(), process.StandardInput.BaseStream); process.StandardInput.BaseStream.Close(); } catch (IOException) {} catch (ObjectDisposedException) {} });
      var output = Task.Run(() => Pump(process.StandardOutput.BaseStream, Console.OpenStandardOutput()));
      var errors = Task.Run(() => Pump(process.StandardError.BaseStream, Console.OpenStandardError()));
      process.WaitForExit();
      if (!TerminateJobObject(job, 1)) throw new Exception("AIGC_PROCESS_CONTAINMENT_FAILED");
      Accounting accounting;
      while (QueryInformationJobObject(job, 1, out accounting, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero) && accounting.active != 0) Thread.Sleep(10);
      Task.WaitAll(output, errors);
      return process.ExitCode;
    } finally { Marshal.FreeHGlobal(memory); CloseHandle(job); }
  }
}
`;
/** Start the service without credentials on command arguments or inherited environment. */
export function launchAigcProcess(executable, args, options) {
    if (process.platform !== 'win32')
        return spawn(executable, [...args], { ...options, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const input = JSON.stringify({ executable, args });
    const script = `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition @'\n${supervisor}\n'@; $inputRow='${input.replaceAll("'", "''")}' | ConvertFrom-Json; exit ([StudyBuddyAigcJob]::Run($inputRow.executable,[string[]]$inputRow.args))`;
    return spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { ...options, windowsHide: true, env: { ...options.env, TEMP: process.env.TEMP, TMP: process.env.TMP }, stdio: ['pipe', 'pipe', 'pipe'] });
}
/** Force only the captured service tree, retaining Job Object cleanup on supervisor exit. */
export async function terminateAigcProcess(child) {
    if (!child.pid) {
        child.kill();
        return;
    }
    if (process.platform !== 'win32') {
        try {
            process.kill(-child.pid, 'SIGKILL');
        }
        catch (error) {
            if (error.code !== 'ESRCH')
                throw error;
        }
        ;
        return;
    }
    await new Promise((accept, reject) => {
        execFile(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 15000 }, (error) => {
            if (error && child.exitCode === null && child.signalCode === null)
                reject(new Error('AIGC_PROCESS_STOP_FAILED'));
            else
                accept();
        });
    });
}
//# sourceMappingURL=aigc-process.js.map