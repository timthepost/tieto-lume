// Plugin to ingest content on build.
// Should probably hash & compare to avoid needless gestation

import { merge } from "lume/core/utils/object.ts";
import { log } from "lume/core/utils/log.ts";
import { Tieto } from "../../_plugins/tieto/tieto.class.ts";

export interface Options {
    stores?: string[];
}

export const defaults: Options = {
    stores: ["../../blog"]
}

export function tietoIngest(userOptions?: Options) {
    const _options = merge(defaults, userOptions);
    const _tieto = new Tieto({debug: true});

    log.info("tieto_ingest: Plugin loaded");

    function ingestPosts() {
        log.info("Would rebuild posts index .... ");
        _options.stores.forEach((store) => {
            log.info('ingesting: ' + store);
        });
    }

    return (site: Lume.Site) => { 
        site.addEventListener("afterBuild", ingestPosts);
    }
}
