declare module "pdf-parse/lib/pdf-parse.js" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse: (buffer: Buffer, options?: any) => Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}
