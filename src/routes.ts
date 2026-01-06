import Router from "lume/middlewares/router.ts";
import { Splinter } from "./splinter.class.ts";

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

const wd = Deno.cwd();
const temp_path  = wd + "/src/splinter_test_bus";
const conn = Splinter.open(temp_path);

/* Define routes for your site here */

// The simple datetime server
router.get("/api", ({ _request }) => {
  const ts = Date.now();
  return new Response(JSON.stringify({ time: ts }), { status: 200 });
});

router.get("/splinter-check", ({ _request }) => {
  conn.set("test_key", "test value");
  const val = conn.getString("test_key");
  return new Response(JSON.stringify({ value: val }), { status: 200 });
});

export default router;
