declare module 'image-size' {
  interface ImageSizeResult {
    width?: number;
    height?: number;
    type?: string;
  }
  function imageSize(input: Buffer): ImageSizeResult;
  export default imageSize;
}
