import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
export function schemaValidator(root) {
  const provenance = JSON.parse(
    readFileSync(resolve(root, "sbom/schemas/provenance.json"), "utf8"),
  );
  for (const source of provenance.sources) {
    const actual = createHash("sha256")
      .update(readFileSync(resolve(root, source.file)))
      .digest("hex");
    if (actual !== source.sha256)
      throw new Error(`Vendored schema hash mismatch: ${source.file}`);
  }
  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    validateFormats: true,
  });
  addFormats(ajv);
  // Current generated documents contain only ASCII URLs/email addresses. Fail closed
  // on international forms rather than silently disabling two draft-07 formats.
  const asciiFormat = (name) => (value) => {
    if (!/^[\x00-\x7F]*$/.test(value)) return false;
    const format = ajv.formats[name];
    return format instanceof RegExp
      ? format.test(value)
      : typeof format === "function"
        ? format(value)
        : format.validate(value);
  };
  ajv.addFormat("iri-reference", asciiFormat("uri-reference"));
  ajv.addFormat("idn-email", asciiFormat("email"));
  const schema = (name) =>
    JSON.parse(readFileSync(resolve(root, `sbom/schemas/${name}`), "utf8"));
  ajv.addSchema(schema("spdx.schema.json"));
  ajv.addSchema(schema("jsf-0.82.schema.json"));
  const validate = ajv.compile(schema("bom-1.5.schema.json"));
  return {
    provenance,
    formatPolicy:
      "All schema constraints and formats evaluated. IRI-reference and IDN-email accept their ASCII URI/email subsets only; international forms fail closed pending a broader format validator.",
    validate(bom, name) {
      if (!validate(bom))
        throw new Error(
          `${name}: CycloneDX schema validation failed: ${ajv.errorsText(validate.errors, { separator: "; " })}`,
        );
    },
  };
}
