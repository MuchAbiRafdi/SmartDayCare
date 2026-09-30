// hls.js hanya menyertakan deklarasi untuk entri utama; entri "light" memakai API yang sama.
declare module "hls.js/light" {
  export * from "hls.js";
  export { default } from "hls.js";
}
