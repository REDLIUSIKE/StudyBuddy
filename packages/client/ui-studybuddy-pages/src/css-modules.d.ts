declare module '*.module.css' { const classes: Record<string, string>; export default classes }
declare module '*.css?inline' { const content: string; export default content }
