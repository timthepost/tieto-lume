import lume from "lume/mod.ts";
import router from "./src/routes.ts";
import plugins from "./plugins.ts";

const site = lume({
  src: "./src",
  server: {
    middlewares: [
      router.middleware()
    ],
  },
});

site.use(plugins());

export default site;
