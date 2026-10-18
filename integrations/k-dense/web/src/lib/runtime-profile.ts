/** Build profile changes composition while retaining the complete standalone workbench. */
export function runtimeProfile(): "standalone" | "studybuddy" {
  return process.env.NEXT_PUBLIC_RESEARCH_PROFILE === "studybuddy" ? "studybuddy" : "standalone";
}
export function researchBrand() {
  return runtimeProfile() === "studybuddy"
    ? { name: "StudyBuddy", logo: "/brand/studybuddy-wordmark.png", title: "研究工作台", website: "https://guijitongzhuo.com/" }
    : { name: "K-Dense BYOK", logo: "/brand/kdense-logo.png", title: "K-Dense BYOK", website: "https://www.k-dense.ai" };
}
