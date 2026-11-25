// Vite (Vitest) imports a file as its text with "?raw"
declare module "*?raw" {
  const text: string;
  export default text;
}
