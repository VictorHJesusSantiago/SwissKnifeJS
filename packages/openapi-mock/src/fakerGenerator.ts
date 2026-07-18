import { faker } from "@faker-js/faker";
import { resolveSchema, type OpenApi, type Schema } from "../../openapi-docgen/src/spec.js";

/** Gera um valor realista para um schema, considerando format/type/nome da propriedade. */
export function fakeFromSchema(raw: Schema | undefined, spec: OpenApi, propName?: string, depth = 0): unknown {
  const schema = resolveSchema(raw, spec);
  if (!schema || depth > 8) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.enum?.length) return schema.enum[randomIndex(schema.enum.length)];

  if (schema.type === "object" || schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, child]) => [key, fakeFromSchema(child, spec, key, depth + 1)])
    );
  }
  if (schema.type === "array") {
    const length = randomIndex(3) + 1;
    return Array.from({ length }, () => fakeFromSchema(schema.items, spec, propName, depth + 1));
  }

  return fakePrimitive(schema, propName);
}

function randomIndex(length: number): number {
  return Math.floor(Math.random() * length);
}

function fakePrimitive(schema: Schema, propName?: string): unknown {
  const format = schema.format?.toLowerCase();
  const name = propName?.toLowerCase() ?? "";

  if (schema.default !== undefined) return schema.default;

  switch (format) {
    case "uuid": return faker.string.uuid();
    case "email": return faker.internet.email();
    case "date-time": return faker.date.recent().toISOString();
    case "date": return faker.date.recent().toISOString().slice(0, 10);
    case "uri": case "url": return faker.internet.url();
    case "hostname": return faker.internet.domainName();
    case "ipv4": return faker.internet.ipv4();
    case "ipv6": return faker.internet.ipv6();
    case "password": return faker.internet.password();
    case "phone": return faker.phone.number();
    case "int32": case "int64": return faker.number.int({ min: 0, max: 100_000 });
    case "float": case "double": return faker.number.float({ min: 0, max: 10_000, fractionDigits: 2 });
    default: break;
  }

  if (schema.type === "integer") return faker.number.int({ min: 0, max: 100_000 });
  if (schema.type === "number") return faker.number.float({ min: 0, max: 10_000, fractionDigits: 2 });
  if (schema.type === "boolean") return faker.datatype.boolean();

  if (schema.type === "string" || schema.type === undefined) return fakeStringByName(name);
  return null;
}

const NAME_MATCHERS: Array<[RegExp, () => unknown]> = [
  [/(^|_)id$/, () => faker.string.uuid()],
  [/uuid/, () => faker.string.uuid()],
  [/email/, () => faker.internet.email()],
  [/(first.?name)/, () => faker.person.firstName()],
  [/(last.?name)/, () => faker.person.lastName()],
  [/(full.?name)|^name$/, () => faker.person.fullName()],
  [/username|login/, () => faker.internet.username()],
  [/password/, () => faker.internet.password()],
  [/phone/, () => faker.phone.number()],
  [/avatar|image|photo|picture/, () => faker.image.avatar()],
  [/url|link|website/, () => faker.internet.url()],
  [/city/, () => faker.location.city()],
  [/country/, () => faker.location.country()],
  [/street|address/, () => faker.location.streetAddress()],
  [/zip|postal/, () => faker.location.zipCode()],
  [/company/, () => faker.company.name()],
  [/(created|updated|deleted).?at$/, () => faker.date.recent().toISOString()],
  [/date/, () => faker.date.recent().toISOString()],
  [/description|bio|summary/, () => faker.lorem.sentence()],
  [/title/, () => faker.lorem.words({ min: 2, max: 5 })],
  [/color/, () => faker.color.human()],
  [/price|amount|cost/, () => faker.commerce.price()],
  [/status/, () => faker.helpers.arrayElement(["active", "inactive", "pending"])]
];

function fakeStringByName(name: string): unknown {
  for (const [matcher, generator] of NAME_MATCHERS) {
    if (matcher.test(name)) return generator();
  }
  return faker.lorem.words({ min: 1, max: 3 });
}
