import Router from "lume/middlewares/router.ts";
import { Libsplinter } from "./splinter_ffi.ts";
const router = new Router();

/* Filter out XSS attempts */
function _sanitizeString(str: string): string {
  if (!str) {
    return "";
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cstr(str: string): [Uint8Array, Deno.PointerValue] {
  const buf = new Uint8Array([...new TextEncoder().encode(str), 0]);
  return [buf, Deno.UnsafePointer.of(buf)];
}
const wd = Deno.cwd();
const temp_path  = wd + "/src/splinter_test_bus";
const [test_bus] = cstr(temp_path);

/* Define routes for your site here */

// The simple datetime server
router.get("/api", ({ _request }) => {
  const ts = Date.now();
  return new Response(JSON.stringify({ time: ts }), { status: 200 });
});

router.get("/splinter-check", ({ _request }) => {

  if (Libsplinter.symbols.splinter_open(<BufferSource> test_bus) !== 0) {
    return new Response(JSON.stringify({error: "Could not open store " + temp_path }), { status: 500 });
  }
  
  const [keyBuf] = cstr("hello");
  const valBuf = new Uint8Array(new TextEncoder().encode("from Deno!"));
  const valPtr = Deno.UnsafePointer.of(valBuf);

  if (Libsplinter.symbols.splinter_set(<BufferSource> keyBuf, valPtr, BigInt(valBuf.byteLength)) !== 0) {
    return  new Response(JSON.stringify({ error: "splinter_set"}), { status: 500 });
  }

  const out = new Uint8Array(128);
  const outPtr = Deno.UnsafePointer.of(out);
  const outLen = new Uint32Array(1);
  const outLenPtr = Deno.UnsafePointer.of(outLen);
  
  if (
    Libsplinter.symbols.splinter_get(<BufferSource> keyBuf, outPtr, BigInt(out.byteLength), outLenPtr) !== 0
  ) {
    return new Response(JSON.stringify({ error: "splinter_get"}), { status: 500 });
  }
  
  const result = new TextDecoder().decode(out.subarray(0, outLen[0]));
  Libsplinter.symbols.splinter_close();
  
  return new Response(JSON.stringify({ contents: result }), { status: 200});
});

export default router;
