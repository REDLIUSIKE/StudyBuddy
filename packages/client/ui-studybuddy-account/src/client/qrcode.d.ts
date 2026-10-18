/** Browser-only QR entry from the installed library; no Node PNG or stream implementation. */
declare module 'qrcode/lib/browser.js'{
  import QRCode from 'qrcode'
  export default QRCode
}
