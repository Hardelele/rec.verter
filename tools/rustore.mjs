// RuStore Public API: черновик версии, установочные файлы, иконка, скриншоты.
//
// Ключ доступа лежит в ops-секрете и расшифровывается SOPS внутри WSL при каждом
// запуске. Ни ключ, ни полученный JWT не попадают в аргументы команд, в файлы
// репозитория и в вывод — токен живёт только в памяти процесса.
//
// Документация: https://www.rustore.ru/help/work-with-rustore-api/
//
//   node tools/rustore.mjs draft            весь черновик: версия, APK, иконка, скриншоты
//   node tools/rustore.mjs status           состояние версий приложения
//   node tools/rustore.mjs commit <id> --yes  отправка на модерацию (делает владелец)
//
// Отдельные подкоманды повторяют любой шаг поштучно — см. USAGE внизу файла.
//
// Два ограничения API, из-за которых порядок шагов не произвольный:
//   — первая версия приложения заводится только через веб-консоль; пока приложение
//     не имеет активной версии, все методы по packageName отвечают 403;
//   — черновик у приложения ровно один, а метаданные после создания не правятся:
//     ошибиться в тексте стоит `delete` и повторного прохода. Отсюда LIMITS.

import { createPrivateKey, createSign, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import { Agent, request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { connect as tlsConnect } from "node:tls";
import { Readable } from "node:stream";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const SECRETS = "/mnt/c/develop/ops/secrets/projects/rustore.sops.yaml";
const AGE_KEY = "/root/.config/sops/age/keys.txt";
const HOST = "public-api.rustore.ru";
const APK_DIR = resolve(ROOT, "android/app/build/outputs/apk/release");
const LISTING = resolve(ROOT, "assets/store/listing.md");
const STORE = resolve(ROOT, "assets/store");

// ─── секреты ────────────────────────────────────────────────────────────────
// Имя поля секретом не является, а значение приходит на stdout и дальше живёт
// только в памяти: в командную строку оно не попадает.

function secret(field) {
  const cmd =
    `SOPS_AGE_KEY_FILE=${AGE_KEY} sops -d --extract '["${field}"]' ${SECRETS}`;
  return execFileSync("wsl", ["-e", "bash", "-lc", cmd], {
    encoding: "utf8",
    maxBuffer: 1 << 20,
  }).trim();
}

// ─── подпись и токен ────────────────────────────────────────────────────────

/** ISO-8601 с миллисекундами и числовым смещением: 2024-06-18T11:49:08.290+03:00 */
function stamp(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const off = -date.getTimezoneOffset();
  const abs = Math.abs(off);
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}` +
    `.${p(date.getMilliseconds(), 3)}` +
    `${off < 0 ? "-" : "+"}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}

/** SHA512withRSA (PKCS#1 v1.5) от строки keyId + timestamp, ключ — base64 PKCS#8 DER. */
function sign(keyId, privateKeyBase64, timestamp) {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return createSign("RSA-SHA512").update(keyId + timestamp).end().sign(key, "base64");
}

let cachedToken = null;

/** JWT доступа. Кэшируется на время жизни процесса, обновляется до истечения ttl. */
export async function token() {
  if (cachedToken && Date.now() < cachedToken.until) return cachedToken.jwe;
  const keyId = secret("key_id");
  const timestamp = stamp();
  const payload = Buffer.from(
    JSON.stringify({ keyId, timestamp, signature: sign(keyId, secret("private_key"), timestamp) }),
  );
  const body = await call("POST", "/public/auth", {
    headers: { "Content-Type": "application/json", "Content-Length": payload.length },
    body: payload,
  });
  cachedToken = { jwe: body.jwe, until: Date.now() + (body.ttl - 60) * 1000 };
  return cachedToken.jwe;
}

// ─── транспорт ──────────────────────────────────────────────────────────────
// Прямой доступ к rustore.ru иногда упирается в 429 от edge VK; тогда помогает
// HTTPS_PROXY=http://127.0.0.1:3128 — туннель поднимается через CONNECT.

const agent = (() => {
  const url = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!url) return undefined;
  const proxy = new URL(url);
  return new Agent({
    createConnection(options, done) {
      const req = httpRequest({
        host: proxy.hostname,
        port: proxy.port || 80,
        method: "CONNECT",
        path: `${options.host}:${options.port || 443}`,
      });
      req.on("connect", (res, socket) => {
        if (res.statusCode !== 200) return done(new Error(`прокси CONNECT → ${res.statusCode}`));
        done(null, tlsConnect({ socket, servername: options.host }));
      });
      req.on("error", done);
      req.end();
    },
  });
})();

/** Запрос к API. Разворачивает конверт {code, message, body} и роняет промис на ошибке. */
function call(method, path, { headers = {}, body, stream } = {}) {
  return new Promise((ok, fail) => {
    const req = httpsRequest(
      { host: HOST, path, method, headers, agent, timeout: 20 * 60_000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let envelope;
          try {
            envelope = JSON.parse(text);
          } catch {
            envelope = { code: String(res.statusCode), message: text.slice(0, 500) };
          }
          if (res.statusCode >= 400 || (envelope.code && envelope.code !== "OK")) {
            fail(new Error(
              `${method} ${path.split("?")[0]} → ${res.statusCode} ` +
              `${envelope.code ?? ""} ${envelope.message ?? text.slice(0, 500)}`.trim(),
            ));
          } else ok(envelope.body);
        });
      },
    );
    req.on("error", fail);
    req.on("timeout", () => req.destroy(new Error("таймаут запроса")));
    if (stream) stream.pipe(req);
    else req.end(body);
  });
}

/** Запрос с токеном доступа. Экспортируется, чтобы дотянуться до методов без обёртки. */
export async function api(method, path, options = {}) {
  return call(method, path, {
    ...options,
    headers: { ...options.headers, "Public-Token": await token() },
  });
}

/** multipart/form-data с одним полем `file`; тело идёт потоком, файл в память не читается. */
async function upload(path, file) {
  const boundary = `----recverter${randomBytes(12).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; ` +
    `filename="${basename(file)}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const size = statSync(file).size;
  const stream = Readable.from(
    (async function* () {
      yield head;
      yield* createReadStream(file);
      yield tail;
    })(),
  );
  return api("POST", path, {
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": head.length + size + tail.length,
    },
    stream,
  });
}

// ─── карточка приложения ────────────────────────────────────────────────────

/** Тексты карточки из assets/store/listing.md: заголовок раздела → первый блок кода. */
export function listing() {
  const md = readFileSync(LISTING, "utf8");
  const sections = {};
  for (const chunk of md.split(/^## /m).slice(1)) {
    const title = chunk.slice(0, chunk.indexOf("\n")).trim();
    const block = chunk.match(/```\n([\s\S]*?)\n```/);
    if (block) sections[title] = block[1].trim();
  }
  return sections;
}

/** Пакет и установочные файлы из отчёта сборки — тот же источник, что у Gradle. */
export function build() {
  const meta = JSON.parse(readFileSync(resolve(APK_DIR, "output-metadata.json"), "utf8"));
  const apks = meta.elements
    .map((e) => ({
      file: resolve(APK_DIR, e.outputFile),
      versionCode: e.versionCode,
      versionName: e.versionName,
      abi: e.filters.find((f) => f.filterType === "ABI")?.value ?? "universal",
    }))
    .sort((a, b) => b.versionCode - a.versionCode);
  return { packageName: meta.applicationId, apks };
}

// Пределы полей карточки. Проверяются до запроса намеренно: черновик у приложения
// может быть только один, а метаданные после создания не правятся — отказ сервера
// стоит удаления версии и повторного прохода.
export const LIMITS = {
  appName: 50,
  shortDescription: 80,
  fullDescription: 4000,
  whatsNew: 5000,
  moderInfo: 180,
};

/** Тело черновика версии: метаданные карточки плюс постоянные поля релиза. */
export function draftBody() {
  const text = listing();
  const body = {
    appName: text["Название"],
    appType: "MAIN",
    categories: ["tools"], // «Полезные инструменты»
    ageLegal: "0+",
    shortDescription: text["Краткое описание"],
    fullDescription: text["Полное описание"],
    whatsNew: text["Что нового"],
    moderInfo: text["Записка для модератора"],
    publishType: "MANUAL", // публикацию после модерации включает владелец руками
  };
  const bad = Object.entries(LIMITS)
    .filter(([field, max]) => !body[field] || body[field].length > max)
    .map(([field, max]) => `${field}: ${body[field]?.length ?? "пусто"} из ${max}`);
  if (bad.length) throw new Error(`карточка не проходит по длине — ${bad.join("; ")}`);
  return body;
}

// ─── шаги публикации ────────────────────────────────────────────────────────

/** Создать черновик версии. Возвращает versionId. Черновик у приложения может быть только один. */
export async function createDraft(pkg = build().packageName, body = draftBody()) {
  const payload = Buffer.from(JSON.stringify(body));
  return api("POST", `/public/v1/application/${pkg}/version`, {
    headers: { "Content-Type": "application/json", "Content-Length": payload.length },
    body: payload,
  });
}

/** Загрузить APK. Основным может быть только один файл версии. */
export async function uploadApk(versionId, file, { main = true, servicesType = "Unknown" } = {}) {
  const pkg = build().packageName;
  return upload(
    `/public/v1/application/${pkg}/version/${versionId}/apk` +
    `?servicesType=${servicesType}&isMainApk=${main}`,
    file,
  );
}

/** Загрузить иконку 512×512. */
export async function uploadIcon(versionId, file = resolve(STORE, "icon-512.png")) {
  const pkg = build().packageName;
  return upload(`/public/v1/application/${pkg}/version/${versionId}/image/icon`, file);
}

/** Загрузить скриншот на позицию ordinal (0..9). */
export async function uploadScreenshot(versionId, file, ordinal, orientation = "PORTRAIT") {
  const pkg = build().packageName;
  return upload(
    `/public/v2/application/${pkg}/version/${versionId}` +
    `/image/screenshot/${orientation}/${ordinal}/SCREENSHOT`,
    file,
  );
}

/** Скриншоты карточки по порядку имён файлов в assets/store/screenshots. */
export function screenshots() {
  const dir = resolve(STORE, "screenshots");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => resolve(dir, name));
}

/** Состояние версий приложения. Без versionId — весь список, включая черновики. */
export async function versions(versionId) {
  const pkg = build().packageName;
  const query = versionId
    ? `ids=${versionId}`
    : "versionStatuses=DRAFT,AUTO_CHECK,MODERATION,TAKEN_FOR_MODERATION," +
      "READY_FOR_PUBLICATION,ACTIVE,PARTIAL_ACTIVE,REJECTED_BY_MODERATOR," +
      "AUTO_CHECK_FAILED,REJECTED_BY_SECURITY&page=0&size=100";
  return api("GET", `/public/v1/application/${pkg}/version?${query}`);
}

/** Приложения аккаунта. */
export async function apps() {
  return api("GET", "/public/v1/application");
}

/** Удалить неопубликованную версию. */
export async function deleteVersion(versionId) {
  const pkg = build().packageName;
  return api("DELETE", `/public/v1/application/${pkg}/version/${versionId}`);
}

/**
 * Отправить черновик на модерацию. Необратимо: после этого версию правят только
 * через отзыв. Вызывается владельцем осознанно, поэтому требует --yes.
 */
export async function commit(versionId, { priorityUpdate = 0 } = {}) {
  const pkg = build().packageName;
  return api(
    "POST",
    `/public/v1/application/${pkg}/version/${versionId}/commit?priorityUpdate=${priorityUpdate}`,
  );
}

/** Черновик целиком: версия, установочный файл, иконка, скриншоты. На модерацию не отправляет. */
export async function draft({ apk } = {}) {
  const { packageName, apks } = build();
  const versionId = await createDraft(packageName);
  console.log(`черновик ${versionId} создан`);

  // Один APK на версию: RuStore требует одинаковый versionCode у всех файлов версии,
  // а у ABI-сплитов он разный по построению. По умолчанию берётся старший код
  // (arm64-v8a); `draft <путь>` ставит другой файл — например universal, который
  // один покрывает и armeabi-v7a, и arm64-v8a.
  const chosen = apk ? [{ file: apk, abi: basename(apk) }] : [apks[0]];
  for (const [i, a] of chosen.entries()) {
    await uploadApk(versionId, a.file, { main: i === 0 });
    console.log(`APK ${a.abi} загружен${i === 0 ? " (основной)" : ""}`);
  }

  await uploadIcon(versionId);
  console.log("иконка загружена");

  for (const [i, file] of screenshots().entries()) {
    await uploadScreenshot(versionId, file, i);
    console.log(`скриншот ${i} — ${basename(file)}`);
  }

  console.log(`\nчерновик готов, на модерацию НЕ отправлен: версия ${versionId}`);
  return versionId;
}

// ─── командная строка ───────────────────────────────────────────────────────

const USAGE = `
  node tools/rustore.mjs auth                     проверить авторизацию
  node tools/rustore.mjs apps                     приложения аккаунта
  node tools/rustore.mjs listing                  тексты карточки и длины полей
  node tools/rustore.mjs draft [<apk>]            черновик целиком
  node tools/rustore.mjs create                   только создать черновик версии
  node tools/rustore.mjs apk <id> <файл> [extra]  загрузить APK
  node tools/rustore.mjs icon <id>                загрузить иконку
  node tools/rustore.mjs screens <id>             загрузить скриншоты
  node tools/rustore.mjs status [<id>]            состояние версий
  node tools/rustore.mjs delete <id>              удалить черновик
  node tools/rustore.mjs commit <id> --yes        отправить на модерацию
`;

const commands = {
  async auth() {
    const jwe = await token();
    console.log(`авторизация прошла, JWT получен (${jwe.length} символов)`);
  },
  async apps() {
    console.log(JSON.stringify(await apps(), null, 2));
  },
  listing() {
    for (const [field, value] of Object.entries(draftBody())) {
      const size = Array.isArray(value) ? value.join(",") : `${value.length} симв.`;
      console.log(`${field}: ${size}${LIMITS[field] ? ` из ${LIMITS[field]}` : ""}`);
    }
    const { packageName, apks } = build();
    console.log(`\n${packageName}`);
    for (const a of apks) console.log(`  ${a.abi} — versionCode ${a.versionCode}, ${a.versionName}`);
    for (const f of screenshots()) console.log(`  скриншот ${basename(f)}`);
  },
  async draft([apk]) {
    await draft({ apk: apk && resolve(apk) });
  },
  async create() {
    console.log(await createDraft());
  },
  async apk([id, file, extra]) {
    console.log(await uploadApk(id, resolve(file), { main: extra !== "extra" }));
  },
  async icon([id]) {
    await uploadIcon(id);
    console.log("иконка загружена");
  },
  async screens([id]) {
    for (const [i, file] of screenshots().entries()) {
      await uploadScreenshot(id, file, i);
      console.log(`скриншот ${i} — ${basename(file)}`);
    }
  },
  async status([id]) {
    console.log(JSON.stringify(await versions(id), null, 2));
  },
  async delete([id]) {
    console.log(await deleteVersion(id));
  },
  async commit([id, flag]) {
    if (flag !== "--yes") throw new Error("отправка на модерацию необратима: повторите с --yes");
    console.log(await commit(id));
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [name, ...args] = process.argv.slice(2);
  const run = commands[name];
  if (!run) {
    console.error(USAGE);
    process.exit(1);
  }
  Promise.resolve(run(args)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
