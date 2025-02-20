import { parseOpenAPI } from '@/lib/openapi';
import { isSmartRouteHandler } from '@/route-handlers/smart-route-handler';
import { HTTP_METHODS } from '@stackframe/stack-shared/dist/utils/http';
import fs from 'fs';
import { glob } from 'glob';
import yaml from 'yaml';

async function main() {
  for (const audience of ['client', 'server', 'admin'] as const) {
    const filePathPrefix = "src/app/api/v1";
    const importPathPrefix = "@/app/api/v1";
    const filePaths = await glob(filePathPrefix + "/**/route.{js,jsx,ts,tsx}");
    const openAPISchema = yaml.stringify(parseOpenAPI({
      endpoints: new Map(await Promise.all(filePaths.map(async (filePath) => {
        if (!filePath.startsWith(filePathPrefix)) {
          throw new Error(`Invalid file path: ${filePath}`);
        }
        const suffix = filePath.slice(filePathPrefix.length);
        const midfix = suffix.slice(0, suffix.lastIndexOf("/route."));
        const importPath = `${importPathPrefix}${suffix}`;
        const urlPath = midfix.replace("[", "{").replace("]", "}");
        const module = require(importPath);
        const handlersByMethod = new Map(
          HTTP_METHODS.map(method => [method, module[method]] as const)
            .filter(([_, handler]) => isSmartRouteHandler(handler))
        );
        return [urlPath, handlersByMethod] as const;
      }))),
      audience,
    }));

    fs.writeFileSync(`../../docs/fern/openapi/${audience}.yaml`, openAPISchema);
  }
  console.log("Successfully updated OpenAPI schemas");
}
main().catch((...args) => {
  console.error(`ERROR! Could not update OpenAPI schema`, ...args);
  process.exit(1);
});
