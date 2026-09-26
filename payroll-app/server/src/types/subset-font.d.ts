declare module 'subset-font' {
  function subsetFont(
    font: Buffer | Uint8Array,
    text: string,
    options?: { targetFormat?: string },
  ): Promise<Buffer>;
  export default subsetFont;
}
