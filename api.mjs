// RVNP Attachment Portal API (Netlify Function + Netlify Blobs)
// Env var required: ADMIN_PASSWORD
import { createHash, createHmac, timingSafeEqual, randomBytes, pbkdf2Sync } from "node:crypto";

export const config = { path: "/api/*" };

/* ---------- storage ---------- */
async function store() {
  if (globalThis.__TEST_STORE__) return globalThis.__TEST_STORE__;
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: "rvnp-portal", consistency: "strong" });
}

const DEFAULT_SETTINGS = {
  policyNumber: "25/50/NKR/002276/07",
  insurer: "First Assurance Company Ltd",
  policyStart: "2026-07-13",
  policyEnd: "2027-07-12",
  issueDate: "2026-07-13",
};
const E = ["Install Conduit System","Install PVC Sheathed Cable System","Install Trunking System","Install Stand-Alone Solar PV Systems","Perform Bell and Alarm Installation","Wind Electrical Machine","Apply Basic Electrical Principles","Apply Digital Literacy","Perform Electrical Installation","Prepare Technical Drawings","Apply Analogue Electronics I","Apply Digital Electronics I","Apply Engineering Technician Mathematics 1","Apply Work Ethics and Practices","Perform Security System Installation","Apply Analogue Electronics II","Apply Digital Electronics II","Apply Engineering Technician Mathematics II","Apply Entrepreneurial Skills","Install Solar PV Systems","Perform Electrical Machine Installation"];
const T = ["Apply Digital Skills","Install Electrical Systems","Prepare Engineering Drawings","Apply Engineering Technician Mathematics","Install Specialized Power Systems","Apply Electrical Principles","Apply Work Ethics and Practices","Install Computer Network","Apply Communication Skills","Apply Entrepreneurial Skills","Fabricate Electronic Circuits","Apply Telecommunication Principles","Fabricate Embedded and RF Circuits"];
const EN = "ELECTRICAL ENGINEERING TECHNOLOGY LEVEL ", TN = "TELECOMMUNICATION TECHNOLOGY LEVEL ";
const DEFAULT_COURSES = [
  { key: "E4", title: EN + "4", percent: 100, units: E.slice(0, 6) },
  { key: "E5", title: EN + "5", percent: 100, units: E },
  { key: "E6", title: EN + "6", percent: 75, units: E },
  { key: "T6", title: TN + "6", percent: 75, units: T },
];

async function getJSON(s, key, fallback) {
  const v = await s.get(key, { type: "json" });
  return v ?? fallback;
}

/* ---------- matching (same rules as the original portal) ---------- */
const normAdm = (a) => String(a).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^L4EI/, "EIL4");
const normName = (n) =>
  String(n).toUpperCase().replace(/[`'\u2019]/g, "").replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/).filter(Boolean).sort().join(" ");
const sid = (name, adm) =>
  createHash("sha256").update(normAdm(adm) + "|" + normName(name)).digest("hex").slice(0, 32);
const clean = (v, max = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/* ---------- auth ---------- */
const secret = () => {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) throw new Error("ADMIN_PASSWORD is not set");
  return createHmac("sha256", "rvnp-admin-v3").update(p).digest();
};
const b64 = (b) => Buffer.from(b).toString("base64url");
function makeToken() {
  const body = b64(JSON.stringify({ typ: "admin", exp: Date.now() + 12 * 3600 * 1000 }));
  return body + "." + b64(createHmac("sha256", secret()).update(body).digest());
}
function validToken(t) {
  try {
    const [body, sig] = String(t).split(".");
    const good = createHmac("sha256", secret()).update(body).digest();
    const got = Buffer.from(sig, "base64url");
    if (got.length !== good.length || !timingSafeEqual(got, good)) return false;
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.typ === "admin" && p.exp > Date.now();
  } catch { return false; }
}
function samePassword(input) {
  const a = createHash("sha256").update(String(input)).digest();
  const b = createHash("sha256").update(String(process.env.ADMIN_PASSWORD || "\u0000none")).digest();
  return timingSafeEqual(a, b) && !!process.env.ADMIN_PASSWORD;
}

/* ---------- HOD access (a code set by the admin, for the ILO HOD / deputy HOD link) ---------- */
const codeHash = (c) => createHash("sha256").update("rvnp-hod|" + String(c)).digest("hex");
async function hodAllowed(req, s) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (t && validToken(t)) return true;
  const stored = await getJSON(s, "hodcode", null), given = req.headers.get("x-hod-code") || "";
  if (!stored || !given) return false;
  const a = Buffer.from(codeHash(given)), b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------- role accounts ---------- */
const USER_TOKEN_TTL = 12 * 3600 * 1000;
function accountId(role, identifier) {
  return createHash("sha256").update(String(role) + "|" + String(identifier).toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex").slice(0, 32);
}

/* ----- email (forgot-PIN links). Needs RESEND_API_KEY; optional MAIL_FROM and SITE_URL ----- */
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
async function mailTo(to, subject, text, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, err: "off" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM || "RVNP Portal <onboarding@resend.dev>", to: [to], subject, text, ...(html && { html }) }),
    });
    return r.ok ? { ok: true } : { ok: false, err: "email service said " + r.status };
  } catch (e) { return { ok: false, err: "could not reach the email service" }; }
}
async function sendMail(to, subject, text) { return (await mailTo(to, subject, text)).ok; }
const tokHash = (t) => createHash("sha256").update("rvnp-reset|" + t).digest("hex");

function pinHash(pin, salt) {
  return pbkdf2Sync(String(pin), Buffer.from(salt, "hex"), 120000, 32, "sha256").toString("hex");
}
function makeAccountToken(a) {
  const body = b64(JSON.stringify({ typ:"user", id:a.id, role:a.role, dept:a.dept || "", exp:Date.now()+USER_TOKEN_TTL }));
  return body + "." + b64(createHmac("sha256", secret()).update(body).digest());
}
function validAccountToken(t) {
  try {
    const [body,sig] = String(t).split(".");
    if (!body || !sig) return null;
    const good=createHmac("sha256",secret()).update(body).digest(), got=Buffer.from(sig,"base64url");
    if(got.length!==good.length || !timingSafeEqual(got,good)) return null;
    const p=JSON.parse(Buffer.from(body,"base64url").toString());
    return p.typ==="user" && p.exp>Date.now() ? p : null;
  } catch { return null; }
}
async function currentAccount(req,s) {
  const t=(req.headers.get("authorization")||"").replace(/^Bearer /,"");
  const p=validAccountToken(t);
  if(!p) return null;
  const all=await getJSON(s,"accounts",{});
  const a=all[p.id];
  return a && a.status==="approved" ? a : null;
}
function requireRole(a, roles) {
  return !!a && roles.includes(a.role);
}

const iloHash = (c) => createHash("sha256").update("rvnp-ilo|" + String(c)).digest("hex");
/* one spelling per town, so the HOD's town and place filters do not split "Nakuru", "NAKURU TOWN" and "nakuru " */
const cleanTown = (v) => { let t = String(v || "").replace(/\s+/g, " ").trim().slice(0, 60); const u = t.replace(/\s+TOWN$/i, ""); return u.length >= 2 ? u : t; };
const digits = (v) => String(v || "").replace(/[^\d+]/g, "").slice(0, 16);

/* ---------- trainers: access code, messages by email / WhatsApp / SMS, and details ---------- */
const CODE_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   /* 32 characters, no 0/O/1/I, so a code typed from a letter is hard to get wrong */
const newCode = () => { let c = ""; for (const x of randomBytes(10)) c += CODE_ALPHA[x % 32]; return c; };
const cleanAccess = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const showCode = (c) => String(c || "").slice(0, 5) + "-" + String(c || "").slice(5);
const intl = (v) => { let d = String(v || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("254")) return d; if (d.startsWith("0")) return "254" + d.slice(1); if (d.length === 9) return "254" + d; return d; };
const baseUrl = (req) => String(process.env.SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
/* SMS is parked: switched OFF for now. To add it later, change SMS_ENABLED to true and set AT_USERNAME and AT_API_KEY. */
const SMS_ENABLED = false;
const CHANNELS = SMS_ENABLED ? ["email", "whatsapp", "sms"] : ["email", "whatsapp"];
const chanOn = () => ({
  email: !!process.env.RESEND_API_KEY,
  whatsapp: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
  sms: SMS_ENABLED && !!(process.env.AT_USERNAME && process.env.AT_API_KEY),
});
const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/* WhatsApp Business Cloud API. A first message to someone who has not written to you must use an approved template (WHATSAPP_TEMPLATE, 3 body variables: name, students, link). Without a template name a plain text is sent, which WhatsApp only delivers inside a 24-hour chat window. */
async function sendWhatsApp(to, text, vars) {
  const tpl = process.env.WHATSAPP_TEMPLATE;
  const payload = tpl
    ? { messaging_product: "whatsapp", to, type: "template", template: { name: tpl, language: { code: process.env.WHATSAPP_LANG || "en" }, components: [{ type: "body", parameters: vars.map((x) => ({ type: "text", text: String(x) })) }] } }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: text, preview_url: true } };
  try {
    const r = await fetch("https://graph.facebook.com/v21.0/" + process.env.WHATSAPP_PHONE_ID + "/messages", { method: "POST", headers: { Authorization: "Bearer " + process.env.WHATSAPP_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) return { ok: true };
    const d = await r.json().catch(() => ({}));
    return { ok: false, err: "WhatsApp said " + r.status + (d && d.error && d.error.message ? ": " + String(d.error.message).slice(0, 120) : "") };
  } catch (e) { return { ok: false, err: "could not reach WhatsApp" }; }
}
/* SMS through Africa's Talking (set AT_USERNAME and AT_API_KEY, optional AT_SENDER). Off until those are set. */
async function sendSms(to, text) {
  const host = process.env.AT_USERNAME === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
  const form = new URLSearchParams({ username: process.env.AT_USERNAME, to: "+" + to, message: text });
  if (process.env.AT_SENDER) form.set("from", process.env.AT_SENDER);
  try {
    const r = await fetch("https://" + host + "/version1/messaging", { method: "POST", headers: { apiKey: process.env.AT_API_KEY, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    return r.ok ? { ok: true } : { ok: false, err: "SMS service said " + r.status };
  } catch (e) { return { ok: false, err: "could not reach the SMS service" }; }
}

const studentsWord = (n) => (n === 1 ? "1 student" : n + " students");
/* the words of the message. kind of situation: first contact (no details yet), update (details already given), or no students yet */
function trainerMsg(t, count, link, code) {
  const first = !t.det, who = t.det ? t.det.name : t.name;
  let short, lead, body;
  if (!count) {
    short = first
      ? "Hello " + who + ", RVNP Industrial Liaison Office needs your details for attachment supervision (name, PF number, ID number, bank and branch). Open " + link + " (access code " + showCode(code) + ")."
      : "Hello " + who + ", you have no students assigned yet. Your RVNP page: " + link;
    lead = first ? "Please give us your details for attachment supervision." : "You have no students assigned yet.";
  } else {
    short = first
      ? "Hello " + who + ", RVNP Industrial Liaison Office has assigned you " + studentsWord(count) + " on industrial attachment. Open " + link + " to confirm your details (name, PF number, ID number, bank and branch) and download your list. Access code: " + showCode(code) + "."
      : "Hello " + who + ", your RVNP attachment list now has " + studentsWord(count) + ". Download it here: " + link;
    lead = first ? "You have been assigned " + studentsWord(count) + " on industrial attachment." : "Your attachment list has been updated. It now has " + studentsWord(count) + ".";
  }
  const ask = first ? "Please open the link below and reply by giving your name, PF number, ID number, bank and bank branch. You can then download your list of students (names, phone numbers and workplaces) as Excel." : "Open the link below to download your latest list. You can also check or correct your details there.";
  const subject = first ? "RVNP: please confirm your details" + (count ? " and download your students list" : "") : "RVNP: your students list has been updated";
  body = "Hello " + who + ",\n\n" + lead + "\n\n" + ask + "\n\n" + link + "\n\nAccess code (if the link does not open): " + showCode(code) + "\nPage: " + link.replace(/\?.*$/, "") + "\n\nThank you,\nRVNP Industrial Liaison Office";
  return { short, subject, body, vars: [who, count ? studentsWord(count) : "no students yet", link] };
}
const escH = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function mailHtml(m, link, code) {
  const paras = m.body.split("\n\n").slice(0, 3).map((x) => "<p style=\"margin:0 0 14px\">" + escH(x).replace(/\n/g, "<br>") + "</p>").join("");
  return "<div style=\"font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#12301f;line-height:1.5\"><div style=\"background:#123b31;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:bold\">Rift Valley National Polytechnic \u00b7 Industrial Liaison Office</div><div style=\"border:1px solid #cfe0d4;border-top:0;padding:18px;border-radius:0 0 10px 10px\">" + paras +
    "<p style=\"margin:20px 0\"><a href=\"" + escH(link) + "\" style=\"background:#17803f;color:#fff;text-decoration:none;padding:13px 22px;border-radius:9px;font-weight:bold;display:inline-block\">Open my page</a></p><p style=\"margin:0;color:#51675a;font-size:13px\">Access code if the button does not work: <b>" + escH(showCode(code)) + "</b></p></div></div>";
}

/* send to one trainer on the chosen channels (default: every channel that is set up). Records what happened on the trainer. Returns {email, whatsapp, sms} = sent | failed | off | nocontact */
async function deliver(req, t, count, only) {
  const on = chanOn(), link = baseUrl(req) + "/trainer.html?t=" + t.tok, m = trainerMsg(t, count, link, t.tok), want = (only && only.length ? only : CHANNELS).filter((c) => CHANNELS.includes(c)), res = {}, jobs = [];
  t.notif = t.notif || {};
  for (const ch of want) {
    if (!on[ch]) { res[ch] = "off"; continue; }
    const to = ch === "email" ? t.email : intl(t.tel);
    if (!to || (ch !== "email" && to.length < 11)) { res[ch] = "nocontact"; continue; }
    jobs.push((async () => {
      let r;
      try { r = await within(ch === "email" ? mailTo(to, m.subject, m.body, mailHtml(m, link, t.tok)) : ch === "whatsapp" ? sendWhatsApp(to, m.short, m.vars) : sendSms(to, m.short), 9000); }
      catch (e) { r = { ok: false, err: "took too long" }; }
      res[ch] = r.ok ? "sent" : "failed";
      t.notif[ch] = r.ok ? { ok: true, at: Date.now() } : { ok: false, at: Date.now(), err: r.err || "failed" };
    })());
  }
  await Promise.all(jobs);
  if (Object.values(res).includes("sent")) { t.sentAt = Date.now(); t.sentCount = count; }
  return res;
}
const trainerCount = (all, tid) => Object.values(all).filter((r) => r.tid === tid).length;

/* ---------- validation ---------- */
/* departments and courses, from the RVNP courses brochure (2025) (units are added later by the ILO representatives) */
const OTHER = "Other courses";
const CATALOG = {
  "Agriculture and Environmental Studies": [["Agricultural Extension",[5,6]],["Dairy Management",[5]],["Horticulture Production",[5,6]],["Sustainable Agriculture",[5,6]],["Aquaculture",[6]]],
  "Agricultural and Mechanical Engineering": [["Agricultural Engineering",[5,6]],["Agriculture Machinery & Equipment",[4,5,6]],["Automotive Technology",[5]],["Welding & Fabrication",[4]],["Mechanical Production Technology",[5]],["Mechanical Technology",[6]],["Automotive Engineering",[6]]],
  "Building and Civil Engineering": [["Building Technology",[5,6]],["Carpentry & Joinery",[4,5]],["Water Technology",[6]],["Land Surveying",[5,6]],["Architectural Draftsman",[5]],["Architecture",[6]],["Civil Engineering",[6]],["Quantity Surveying",[6]],["Waste Water & Sanitation Engineering",[6]],["Water Engineering",[6]],["Plumbing",[5,6]]],
  "Business Studies": [["Accountancy plus Quickbooks",[6]],["Banking & Finance plus Quickbooks",[6]],["Business Mgt with ICT",[5,6]],["Cooperative Mgt with ICT",[5,6]],["Human Resource Mgt with ICT",[5,6]],["Office Administration (Secretarial) with ICT",[5,6]],["Supply Chain Mgt with ICT",[5,6]],["Store Keeping Mgt with ICT",[5]],["Road Transport Mgt with ICT",[5,6]],["Project Mgt with ICT",[5,6]],["Investment Mgt with ICT",[6]]],
  "Electrical and Electronics Engineering": [["Electronics Engineering",[5,6]],["Electrical Engineering (Power Option)",[6]],["Electrical Installation Technology",[4]],["Solar PV System Installation Technology",[4]],["Electrical Engineering Technology",[5,6]],["Telecommunication Engineering Technology",[6]],["Instrumentation & Control Technology",[5,6]]],
  "Health and Applied Sciences": [["Nutrition & Dietetics",[5,6]],["Science Laboratory",[5,6]],["Applied Biology",[6]],["Analytical Chemistry",[6]],["Medical Engineering",[6]],["Food Technology",[6]],["Health Records & IT",[5,6]]],
  "Hospitality and Tourism": [["Baking Technology",[5,6]],["Fashion Design",[4,5]],["Fashion Design Mgt",[6]],["Food & Beverage Production (Culinary Arts)",[4,5]],["Food & Beverage Sales and Service Manager",[6]],["Hair Dressing",[4,5]],["Beauty Therapy",[4,5]],["House Keeping & Accommodation",[5,6]],["Tourism & Travel Mgt",[5,6]],["Tour Guide Operations",[5]],["Catering & Accommodation Mgt",[5,6]],["Catering & Accommodation",[6]],["Tourism Management",[5,6]]],
  "Information Communication Technology": [["Library & Information Science",[5,6]],["Computer Science",[6]],["ICT Technician",[5,6]]],
  "Liberal Studies": [["Counselling Psychology",[5,6]],["Social Work & Community Development",[5,6]]],
  "Short Courses": [["Driving Instructor Training Course",[0]],["Driving",[0]],["International Computer Driving License (ICDL)",[0]],["Computer Packages",[0]],["Computer Repair & Maintenance",[0]]],
};
const DEPTS = Object.keys(CATALOG), ELEC = "Electrical and Electronics Engineering";
const normT = (t) => String(t).toUpperCase().replace(/[^A-Z0-9]/g, "");
function catalogList() {
  const out = []; let d = 0;
  for (const [dept, items] of Object.entries(CATALOG)) {
    d++; let n = 0;
    for (const [name, levels] of items) for (const l of levels) { n++; out.push({ key: "D" + d + "-" + n, dept, title: name.toUpperCase().replace(/\s+/g, " ") + (l ? " LEVEL " + l : ""), percent: 0, units: [] }); }
  }
  return out;
}
/* first use: attach departments to the existing courses and add the brochure courses once */
async function loadCourses(s) {
  let c = await getJSON(s, "courses", null);
  if (!(await getJSON(s, "seeded", false))) {
    c = (c || DEFAULT_COURSES).map((x) => ({ ...x }));
    const cat = catalogList(), have = new Map(c.map((x) => [normT(x.title), x]));
    for (const k of cat) { const m = have.get(normT(k.title)); if (m && !m.dept) m.dept = k.dept; }
    for (const x of c) if (!x.dept) x.dept = /ELECTR|TELECOM|INSTRUMENT/.test(x.title) ? ELEC : OTHER;
    for (const k of cat) if (!have.has(normT(k.title))) c.push(k);
    await s.setJSON("courses", c); await s.setJSON("seeded", true);
  }
  /* one-time update to the 2025 course list: adds missing courses, drops old seeded courses that are not in it and have no units yet */
  if (!(await getJSON(s, "catalog2025", false))) {
    c = (c || DEFAULT_COURSES).map((x) => ({ ...x }));
    const cat = catalogList(), want = new Set(cat.map((k) => normT(k.title))), have = new Map(c.map((x) => [normT(x.title), x])), keys = new Set(c.map((x) => x.key));
    for (const k of cat) {
      const m = have.get(normT(k.title)); if (m) { if (!m.dept) m.dept = k.dept; continue; }
      let key = k.key; while (keys.has(key)) key += "x"; keys.add(key); c.push({ ...k, key });
    }
    c = c.filter((x) => want.has(normT(x.title)) || (x.units && x.units.length) || !/^D\d+-\d+/.test(String(x.key || "")));
    await s.setJSON("courses", c); await s.setJSON("catalog2025", true);
  }
  return c || DEFAULT_COURSES;
}
function deptList(courses) { return courses.some((c) => c.dept === OTHER) ? [...DEPTS, OTHER] : DEPTS; }

/* ---------- intakes and class codes ---------- */
/* intake letter as printed in the admission number (EETL6/24S/2456677 = September 2024); "Other" has no fixed letter */
const INTAKES = [["January","J"],["May","M"],["September","S"],["October","O"],["February","F"],["Other",""]];
const intakeNames = () => INTAKES.map((x) => x[0]);
const intakeLetter = (name) => (INTAKES.find((x) => x[0] === name) || [])[1] || "";
/* reads prefix, year and intake letter out of an admission number such as EETL6/24S/2456677 */
function parseAdm(adm) {
  const m = /^([A-Z0-9]{2,8})\/(?:(\d{2})([A-Z])?\/)?(\d{4,8})$/.exec(adm);
  if (!m) return null;
  return { prefix: m[1], year: m[2] ? 2000 + Number(m[2]) : 0, letter: m[3] || "" };
}
const codeKey = (course, intake, year) => normT(course) + "|" + intake + "|" + year;
function cleanCode(v) {
  return String(v || "").toUpperCase().replace(/[\s_]+/g, "").replace(/[^A-Z0-9-]/g, "").replace(/-{2,}/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}
async function loadClassCodes(s) { const l = await getJSON(s, "classcodes", []); return Array.isArray(l) ? l : []; }
/* works out the class of a student: chosen code, the only code for that course/intake/year, or a provisional code until the Admin assigns one */
function resolveClass(codes, course, intake, adm, chosen) {
  const a = parseAdm(adm) || { prefix: "", year: 0, letter: "" };
  const year = a.year || 0;
  const match = codes.filter((c) => codeKey(c.course, c.intake, c.year) === codeKey(course, intake, year));
  if (chosen) {
    const c = cleanCode(chosen);
    if (match.some((x) => x.code === c)) return { cls: c, pending: false, match };
    throw new Bad("Choose your class from the list.");
  }
  if (match.length === 1) return { cls: match[0].code, pending: false, match };
  if (match.length > 1) throw new Bad("Your course has more than one class for that intake. Choose your class from the list.");
  const prov = a.prefix ? a.prefix + (year ? "-" + String(year).slice(2) + (a.letter || intakeLetter(intake)) : "") : "PENDING";
  return { cls: prov, pending: true, match };
}
/* after the Admin saves class codes: students waiting for a code get it when exactly one code fits */
async function applyClassCodes(s) {
  const codes = await loadClassCodes(s), all = await getJSON(s, "accounts", {}), reg = await getJSON(s, "register", {});
  let n = 0;
  for (const a of Object.values(all)) {
    if (a.role !== "student" || !a.course || !a.intake) continue;
    const info = parseAdm(a.adm); if (!info || !info.year) continue;
    const match = codes.filter((c) => codeKey(c.course, c.intake, c.year) === codeKey(a.course, a.intake, info.year));
    if (a.clsPending && match.length === 1) {
      a.cls = match[0].code; a.clsPending = false; n++;
      for (const r of Object.values(reg)) if (r.accountId === a.id) r.c = a.cls;
    } else if (!a.clsPending && a.cls && !match.some((c) => c.code === a.cls) && match.length === 1) {
      /* a code the Admin removed or changed: move the student to the code that now fits */
      a.cls = match[0].code; n++;
      for (const r of Object.values(reg)) if (r.accountId === a.id) r.c = a.cls;
    }
  }
  if (n) { await s.setJSON("accounts", all); await s.setJSON("register", reg); }
  return n;
}
function cleanClassCodes(list, courses) {
  if (!Array.isArray(list)) throw new Bad("Nothing to save.");
  if (list.length > 3000) throw new Bad("Too many class codes.");
  const titles = new Set(courses.map((c) => normT(c.title))), seen = new Set(), out = [];
  for (const x of list) {
    const course = clean(x.course, 120).toUpperCase(), intake = clean(x.intake, 20), year = Number(x.year), code = cleanCode(x.code);
    if (!titles.has(normT(course))) throw new Bad("\"" + course + "\" is not a course in the list.");
    if (!intakeNames().includes(intake)) throw new Bad("Choose an intake for " + code + ".");
    if (!(year >= 2000 && year <= 2100)) throw new Bad("Enter a year such as 2026 for " + code + ".");
    if (code.length < 4 || !/[A-Z]/.test(code)) throw new Bad("Class code \"" + code + "\" is too short. Use the format EETL6-26S-RS.");
    if (seen.has(code)) throw new Bad("The class code " + code + " is entered twice.");
    seen.add(code); out.push({ course, intake, year, code });
  }
  return out.sort((a, b) => a.course.localeCompare(b.course) || a.year - b.year || a.code.localeCompare(b.code));
}
class Bad extends Error {}
/* named policies (a library): each student can be on the default policy, on one of these, or have one-off custom dates */
function cleanPolicies(list) {
  if (!Array.isArray(list)) throw new Bad("Nothing to save.");
  if (list.length > 30) throw new Bad("Too many policies (limit 30).");
  const names = new Set();
  return list.map((x, i) => {
    const name = clean(x.name, 60);
    if (name.length < 2) throw new Bad("Policy " + (i + 1) + " needs a name, e.g. \"Policy 2 - January intake\".");
    if (names.has(name.toLowerCase())) throw new Bad("Two policies are called \"" + name + "\". Give each its own name.");
    names.add(name.toLowerCase());
    let v;
    try { v = cleanSettings(x); } catch (e) { throw new Bad(name + ": " + e.message); }
    const id = /^P[a-z0-9]{3,20}$/.test(clean(x.id, 30)) ? x.id : "P" + Date.now().toString(36) + i;
    return { id, name, ...v };
  });
}
function effective(rec, settings, policies) {
  const pol = rec.pid && policies.find((x) => x.id === rec.pid);
  const b = pol || settings;
  return { n: rec.n, a: rec.a, c: rec.c, p: rec.p || b.policyNumber, i: rec.i || b.issueDate, s: rec.s || b.policyStart, e: rec.e || b.policyEnd, ins: b.insurer };
}
/* optional per-student policy details: policy number p, issue date i, start s, expiry e (blank = use the defaults) */
function pdate(v) {
  v = clean(v, 40); if (!v) return "";
  let y, m, d, x;
  if ((x = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) { d = +x[1]; m = +x[2]; y = +x[3]; }
  else { const t = new Date(v); if (isNaN(t)) throw new Bad("Could not read the date \"" + v + "\". Use day/month/year, e.g. 13/07/2026."); y = t.getFullYear(); m = t.getMonth() + 1; d = t.getDate(); }
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) throw new Bad("\"" + v + "\" is not a real date.");
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}
function policyOverrides(o, settings) {
  const out = {}, p = clean(o.p, 60), i = pdate(o.i), st = pdate(o.s), e = pdate(o.e);
  if (p) out.p = p; if (i) out.i = i; if (st) out.s = st; if (e) out.e = e;
  const a = out.s || settings.policyStart, b = out.e || settings.policyEnd;
  if (b < a) throw new Bad("The expiry date is before the start date.");
  return out;
}
function cleanSettings(x) {
  const o = {
    policyNumber: clean(x.policyNumber, 60), insurer: clean(x.insurer, 80),
    policyStart: clean(x.policyStart, 10), policyEnd: clean(x.policyEnd, 10), issueDate: clean(x.issueDate, 10),
  };
  if (!o.policyNumber || !o.insurer) throw new Bad("Policy number and insurer are required.");
  for (const k of ["policyStart", "policyEnd", "issueDate"])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o[k]) || isNaN(Date.parse(o[k]))) throw new Bad("Enter a valid date for " + k + ".");
  if (o.policyEnd < o.policyStart) throw new Bad("Policy end date is before the start date.");
  return o;
}
function cleanCourses(list) {
  if (!Array.isArray(list) || !list.length) throw new Bad("Add at least one course.");
  const seen = new Set();
  return list.map((c, i) => {
    const title = clean(c.title, 120).toUpperCase();
    if (!title) throw new Bad("Course " + (i + 1) + " needs a title.");
    const percent = Number(c.percent);
    if (!(percent >= 0 && percent <= 100)) throw new Bad(title + ": coursework covered must be between 0 and 100.");
    const units = (Array.isArray(c.units) ? c.units : []).map((u) => clean(u, 120)).filter(Boolean);
    const dept = DEPTS.includes(c.dept) || c.dept === OTHER ? c.dept : OTHER;
    let key = clean(c.key, 30).replace(/[^A-Za-z0-9_-]/g, "") || "C" + Date.now().toString(36) + i;
    while (seen.has(key)) key += "x";
    seen.add(key);
    return { key, title, dept, percent, units };
  });
}

async function audit(s, e) {
  const a = await getJSON(s, "audit", []); a.push({ t: Date.now(), ...e });
  await s.setJSON("audit", a.slice(-5000));
}
async function staff(req, s) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  const isAdmin = !!tok && validToken(tok), acct = isAdmin ? null : await currentAccount(req, s);
  const role = isAdmin ? "admin" : acct && acct.role !== "student" ? acct.role : "";
  return { acct, isAdmin, role, isHod: isAdmin || role === "hod" || role === "deputy", repDept: role === "rep" ? acct.dept : "", who: isAdmin ? "Administrator" : acct ? acct.name : "" };
}
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (msg, status = 400) => json({ error: msg }, status);

export default async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\/?/, "").replace(/^\/\.netlify\/functions\/api\/?/, "").replace(/\/$/, "");
    const method = req.method;
    const s = await store();
    const body = ["POST", "PUT"].includes(method) ? await req.json().catch(() => ({})) : {};


    /* ----- account registration/login ----- */
    if (method === "GET" && path === "auth-info") {
      const cs = await loadCourses(s);
      return json({
        departments: DEPTS.concat(OTHER),
        courses: cs.map((c) => ({ dept: c.dept, title: c.title })),
        intakes: intakeNames(),
        classcodes: await loadClassCodes(s),
      });
    }
    if (method === "POST" && path === "auth/register-staff") {
      const role=clean(body.role,20).toLowerCase();
      if(!["hod","deputy","rep"].includes(role)) throw new Bad("Choose HOD, Deputy HOD or ILO Representative.");
      const name=clean(body.name,120).toUpperCase(), idno=clean(body.idno,60).toUpperCase().replace(/\s+/g,"");
      const phone=digits(body.phone), pf=clean(body.pf,60).toUpperCase().replace(/\s+/g,"");
      const dept=clean(body.dept,80), pin=String(body.pin||"");
      if(name.length<3) throw new Bad("Enter your full name.");
      if(idno.length<4) throw new Bad("Enter a valid ID number.");
      if(phone.replace(/\D/g,"").length<9) throw new Bad("Enter a valid phone number.");
      if(pf.length<2) throw new Bad("Enter your PF number.");
      const email=clean(body.email,200).toLowerCase();
      if(!EMAIL_RE.test(email)) throw new Bad("Enter a valid email address. It is used to reset your PIN if you forget it.");
      if(role==="rep" && !DEPTS.includes(dept) && dept!==OTHER) throw new Bad("Choose your department.");
      if(pin.length<6 || pin.length>12 || !/^\d+$/.test(pin)) throw new Bad("Use a 6-12 digit PIN.");
      const all=await getJSON(s,"accounts",{});
      if(Object.values(all).some(a=>a.idno===idno || a.pf===pf)) throw new Bad("An account with that ID or PF number already exists.");
      const id="A"+Date.now().toString(36)+randomBytes(3).toString("hex");
      const salt=randomBytes(16).toString("hex");
      if(Object.values(all).some(x=>x.email===email&&x.id!==id)) throw new Bad("That email is already used by another account.");
      all[id]={id,role,name,idno,phone,pf,email,dept:role==="rep"?dept:"",salt,pinHash:pinHash(pin,salt),status:"pending",createdAt:Date.now()};
      await s.setJSON("accounts",all);
      return json({ok:true,status:"pending",message:"Registration submitted. The administrator must approve your account before you can log in."});
    }
    if (method === "POST" && path === "auth/register-student") {
      const name=clean(body.name,120).toUpperCase(), adm=clean(body.adm,60).toUpperCase().replace(/\s+/g,"");
      const dept=clean(body.dept,80), phone=digits(body.phone), pin=String(body.pin||"");
      const course=clean(body.course,120).toUpperCase(), intake=clean(body.intake,20), gender=clean(body.gender,10), idno=clean(body.idno,20).toUpperCase().replace(/[\s-]/g,"");
      if(name.length<3) throw new Bad("Enter your full name.");
      if(!DEPTS.includes(dept) && dept !== OTHER) throw new Bad("Choose your department.");
      const courses=await loadCourses(s);
      if(!courses.some(c=>c.dept===dept && normT(c.title)===normT(course))) throw new Bad("Choose your course.");
      if(!intakeNames().includes(intake)) throw new Bad("Choose your intake month.");
      const info=parseAdm(adm);
      if(!info) throw new Bad("Enter your admission number as printed on your ID, with the slashes, e.g. EETL6/24S/2456677");
      if(info.letter && intakeLetter(intake) && info.letter!==intakeLetter(intake)) throw new Bad("Your admission number has the letter "+info.letter+" but you chose "+intake+". Check the intake month or the admission number.");
      if(!["Male","Female"].includes(gender)) throw new Bad("Choose your gender.");
      if(!/^[A-Z0-9]{6,12}$/.test(idno)) throw new Bad("Enter your ID number (6 to 12 letters or digits).");
      if(phone.replace(/\D/g,"").length<9) throw new Bad("Enter a valid phone number.");
      if(pin.length<6 || pin.length>12 || !/^\d+$/.test(pin)) throw new Bad("Use a 6-12 digit PIN.");
      const nokN=clean(body.nokName,100), nokR=clean(body.nokRel,40), nokT=digits(body.nokTel), emN=clean(body.emName,100), emT=digits(body.emTel);
      if(nokN.length<3) throw new Bad("Enter your next of kin's full name.");
      if(nokR.length<3) throw new Bad("Enter your next of kin's relationship to you.");
      if(nokT.replace(/\D/g,"").length<9) throw new Bad("Enter your next of kin's phone number.");
      if(emN.length<3) throw new Bad("Enter an emergency contact's name.");
      if(emT.replace(/\D/g,"").length<9) throw new Bad("Enter an emergency contact's phone number.");
      if(body.consent!==true) throw new Bad("You must accept the privacy notice to register.");
      const email=clean(body.email,200).toLowerCase();
      if(!EMAIL_RE.test(email)) throw new Bad("Enter a valid email address. It is used to reset your PIN if you forget it.");
      const rc=resolveClass(await loadClassCodes(s),course,intake,adm,body.cls), cls=rc.cls;
      const all=await getJSON(s,"accounts",{});
      const old=Object.values(all).find(a=>a.role==="student" && a.adm===adm);
      if(old && old.consentAt) throw new Bad("This admission number is already registered. Sign in, or ask your ILO Representative or the HOD to reset your PIN.");
      const id=old?old.id:"S"+Date.now().toString(36)+randomBytes(3).toString("hex");
      const salt=randomBytes(16).toString("hex");
      if(Object.values(all).some(x=>x.email===email&&x.id!==id)) throw new Bad("That email is already used by another account.");
      all[id]={id,role:"student",name,adm,cls,clsPending:rc.pending,dept,course,intake,gender,idno,phone,email,salt,pinHash:pinHash(pin,salt),status:"approved",nokName:nokN,nokRel:nokR,nokTel:nokT,emName:emN,emTel:emT,consentAt:Date.now(),createdAt:old?.createdAt||Date.now(),updatedAt:Date.now()};
      await s.setJSON("accounts",all);
      const reg=await getJSON(s,"register",{});
      const rid=sid(name,adm);
      reg[rid]={id:rid,n:name,a:adm,c:cls,tel:phone,accountId:id,t:Date.now()};
      await s.setJSON("register",reg);
      return json({ok:true,updated:!!old,cls,classPending:rc.pending});
    }
    /* a signed-in student completes or corrects the saved profile (older accounts have no course, gender or ID number) */
    if (method === "POST" && path === "profile/complete") {
      const acct = await currentAccount(req,s); if(!acct || acct.role!=="student") return fail("Please sign in again.",401);
      const name=clean(body.name,120).toUpperCase(), adm=clean(body.adm,60).toUpperCase().replace(/\s+/g,""), email=clean(body.email,200).toLowerCase(), phone=digits(body.phone), altPhone=digits(body.altPhone);
      if(name.length<3) throw new Bad("Enter your full name.");
      if(!parseAdm(adm)) throw new Bad("Enter a valid admission number as printed on your student ID.");
      if(!EMAIL_RE.test(email)) throw new Bad("Enter a valid email address.");
      if(phone.replace(/\D/g,"").length<9) throw new Bad("Enter a valid primary phone number.");
      if(altPhone && altPhone.replace(/\D/g,"").length<9) throw new Bad("Enter a valid alternative phone number, or leave it empty.");
      const all=await getJSON(s,"accounts",{}), a=all[acct.id];
      if(Object.values(all).some(x=>x.id!==a.id && x.role==="student" && x.adm===adm)) throw new Bad("That admission number is already registered to another student.");
      if(Object.values(all).some(x=>x.id!==a.id && x.email===email)) throw new Bad("That email address is already used by another account.");
      const oldAdm=a.adm, oldName=a.name;
      const dept=clean(body.dept,80), course=clean(body.course,120).toUpperCase(), intake=clean(body.intake,20), gender=clean(body.gender,10), idno=clean(body.idno,20).toUpperCase().replace(/[\s-]/g,"");
      if(!DEPTS.includes(dept) && dept !== OTHER) throw new Bad("Choose your department.");
      const courses=await loadCourses(s);
      if(!courses.some(c=>c.dept===dept && normT(c.title)===normT(course))) throw new Bad("Choose your course.");
      if(!intakeNames().includes(intake)) throw new Bad("Choose your intake month.");
      if(!["Male","Female"].includes(gender)) throw new Bad("Choose your gender.");
      if(!/^[A-Z0-9]{6,12}$/.test(idno)) throw new Bad("Enter your ID number (6 to 12 letters or digits).");
      const info=parseAdm(adm);
      if(info && info.letter && intakeLetter(intake) && info.letter!==intakeLetter(intake)) throw new Bad("Your admission number has the letter "+info.letter+" but you chose "+intake+".");
      const rc=resolveClass(await loadClassCodes(s),course,intake,adm,body.cls);
      Object.assign(a,{name,adm,email,phone,altPhone,dept,course,intake,gender,idno,cls:rc.cls,clsPending:rc.pending,updatedAt:Date.now()});
      await s.setJSON("accounts",all);
      const reg=await getJSON(s,"register",{});
      for(const [k,r] of Object.entries(reg)) if(r.accountId===a.id){r.n=name;r.a=adm;r.tel=phone;r.c=a.cls;if(k!==sid(name,adm)){delete reg[k];reg[sid(name,adm)]=r;}}
      await s.setJSON("register",reg);
      if(oldAdm!==adm || oldName!==name){
        const pls=await getJSON(s,"placements",{}), oldKey=sid(oldName,oldAdm), newKey=sid(name,adm);
        if(pls[oldKey]){const record=pls[oldKey];delete pls[oldKey];record.n=name;record.a=adm;record.cls=a.cls;record.dept=dept;record.course=course;record.tel1=phone;record.tel2=altPhone;pls[newKey]=record;await s.setJSON("placements",pls);}
      }
      await audit(s,{type:"student-profile-updated",studentId:a.id,oldAdm,newAdm:adm,oldName,newName:name,by:"student",role:"student"});
      return json({ok:true,cls:a.cls});
    }
    if (method === "POST" && path === "auth/forgot") {
      const email = clean(body.email, 200).toLowerCase();
      const generic = { ok: true, message: "If that email is registered, a reset link has been sent. Check your inbox and spam folder. The link works for 30 minutes." };
      if (!EMAIL_RE.test(email)) return json(generic);
      const all = await getJSON(s, "accounts", {}), a = Object.values(all).find((x) => x.email === email);
      const toks = await getJSON(s, "resettokens", {}), now = Date.now();
      for (const k of Object.keys(toks)) if (toks[k].exp < now) delete toks[k];
      if (a && !Object.values(toks).some((t) => t.acc === a.id && t.made > now - 120000)) {
        const tok = randomBytes(24).toString("hex");
        toks[tokHash(tok)] = { acc: a.id, exp: now + 30 * 60000, made: now };
        await s.setJSON("resettokens", toks);
        const base = (process.env.SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
        await sendMail(email, "RVNP Portal: reset your PIN", "Hello " + a.name + ",\n\nOpen this link to set a new PIN (valid for 30 minutes, works once):\n" + base + "/auth.html?reset=" + tok + "\n\nIf you did not ask for this, ignore this email. Your PIN stays the same.\n\nRVNP Industrial Liaison Office");
      } else await s.setJSON("resettokens", toks);
      return json(generic);
    }
    if (method === "POST" && path === "auth/reset") {
      const tok = clean(body.token, 100), pin = String(body.pin || "");
      if (pin.length < 6 || pin.length > 12 || !/^\d+$/.test(pin)) throw new Bad("Use a 6-12 digit PIN.");
      const toks = await getJSON(s, "resettokens", {}), h = tokHash(tok), t = toks[h];
      if (!t || t.exp < Date.now()) throw new Bad("This reset link is invalid or has expired. Ask for a new one.");
      const all = await getJSON(s, "accounts", {}), a = all[t.acc];
      if (!a) throw new Bad("This reset link is invalid or has expired. Ask for a new one.");
      const salt = randomBytes(16).toString("hex"); a.salt = salt; a.pinHash = pinHash(pin, salt);
      await s.setJSON("accounts", all);
      delete toks[h]; await s.setJSON("resettokens", toks);
      const lf = await getJSON(s, "loginfail", {});
      for (const idf of [a.adm, a.idno, a.pf]) if (idf) for (const r of ["student", "staff", a.role]) delete lf[createHash("sha256").update(r + "|" + idf).digest("hex").slice(0, 24)];
      await s.setJSON("loginfail", lf);
      await audit(s, { type: "pin-reset-email", adm: a.adm || a.idno, by: "self (email link)", role: a.role });
      return json({ ok: true, message: "PIN changed. You can sign in now." });
    }

    if (method === "POST" && path === "auth/login") {
      const role=clean(body.role,20).toLowerCase(), identifier=clean(body.identifier,80).toUpperCase().replace(/\s+/g,""), pin=String(body.pin||"");
      const lfKey=createHash("sha256").update(role+"|"+identifier).digest("hex").slice(0,24), lf=await getJSON(s,"loginfail",{});
      if(lf[lfKey] && lf[lfKey].until>Date.now()) return fail("Too many wrong attempts. Try again in "+Math.ceil((lf[lfKey].until-Date.now())/60000)+" minutes.",429);
      const all=await getJSON(s,"accounts",{});
      const a=Object.values(all).find(x=>
        role==="staff"
          ? x.role!=="student" && (x.idno===identifier || x.pf===identifier)
          : x.role===role && ((role==="student"&&x.adm===identifier) || role!=="student"&&(x.idno===identifier||x.pf===identifier))
      );
      if(!a || !a.salt || pinHash(pin,a.salt)!==a.pinHash) { await new Promise(r=>setTimeout(r,500)); const e=lf[lfKey]||{n:0}; e.n++; if(e.n>=5){e.until=Date.now()+15*60000;e.n=0;} lf[lfKey]=e; await s.setJSON("loginfail",lf); return fail("Wrong login details.",401); }
      if(lf[lfKey]){ delete lf[lfKey]; await s.setJSON("loginfail",lf); }
      if(a.status!=="approved") return fail(a.status==="pending"?"Your account is waiting for administrator approval.":"Your account is not active.",403);
      /* HOD, Deputy HOD and ILO Representative each have their own sign-in: an account only opens through its own door */
      const want=clean(body.as,10).toLowerCase(), ROLE_NAME={hod:"an ILO HOD",deputy:"a Deputy HOD",rep:"an ILO Representative"};
      if(want && ROLE_NAME[want] && a.role!==want) return fail("This is "+(ROLE_NAME[a.role]||"another kind of")+" account. Please use the "+(ROLE_NAME[a.role]||"correct").replace(/^an? /,"")+" sign-in.",403);
      return json({token:makeAccountToken(a),role:a.role,name:a.name,dept:a.dept||"",id:a.id});
    }

    /* ----- public ----- */
    if (method === "GET" && path === "me") {
      const acct = await currentAccount(req,s); if(!acct) return fail("Please sign in again.",401);
      return json({ id:acct.id, role:acct.role, name:acct.name, adm:acct.adm||"", cls:acct.cls||"", clsPending:!!acct.clsPending, dept:acct.dept||"", course:acct.course||"", intake:acct.intake||"", gender:acct.gender||"", idno:acct.idno||"", phone:acct.phone||"", altPhone:acct.altPhone||"", email:acct.email||"" });
    }
    if (method === "GET" && path === "courses") {
      const courses = await loadCourses(s);
      return json({ courses, departments: deptList(courses), nita: await getJSON(s, "nitameta", null), nitas: await getJSON(s, "nitasmeta", {}) });
    }
    if (method === "GET" && path === "stamp") {
      const k = clean(url.searchParams.get("k"), 10), f = /^(oct|feb|jun)\d{4}$/.test(k) ? await getJSON(s, "stamp_" + k, null) : null;
      if (!f || !f.data) return fail("No stamp uploaded.", 404);
      return new Response(Buffer.from(f.data, "base64"), { headers: { "Content-Type": f.type || "image/png", "Cache-Control": "no-cache" } });
    }
    if (method === "GET" && path === "nita") {
      const nk = clean(url.searchParams.get("k"), 10);
      let f, m;
      if (/^(oct|feb|jun)\d{4}$/.test(nk)) { f = await getJSON(s, "nitaf_" + nk, null); m = (await getJSON(s, "nitasmeta", {}))[nk]; }
      if (!f || !f.data || !m) { f = await getJSON(s, "nitafile", null); m = await getJSON(s, "nitameta", null); }
      if (!f || !m) return fail("The NITA form has not been uploaded yet.", 404);
      return new Response(Buffer.from(f.data, "base64"), { headers: { "X-Filename": m.name.replace(/[^A-Za-z0-9._ -]/g, "_"), "Content-Type": m.type || "application/octet-stream", "Content-Disposition": 'attachment; filename="' + m.name.replace(/[^A-Za-z0-9._ -]/g, "_") + '"', "Cache-Control": "no-store" } });
    }
    if (method === "POST" && path === "placement") {
      const acct = await currentAccount(req,s); if(!requireRole(acct,["student"])) return fail("Please sign in as a student.",401);
      const n = acct.name, a = acct.adm, cls = acct.cls, dept = acct.dept, tel1 = acct.phone,
        course = clean(body.course, 120).toUpperCase(), org = clean(body.org, 120),
        loc = clean(body.loc, 200), sup = clean(body.sup, 100), supTel = digits(body.supTel), town = cleanTown(body.town), county = clean(body.county, 50),
        tel2 = digits(body.tel2 || acct.altPhone);
      if (n.length < 3) throw new Bad("Enter your full name.");
      if (a.length < 6) throw new Bad("Your account is missing a valid admission number.");
      if (cls.length < 2) throw new Bad("Your account is missing a class. Please update your student account.");
      if (!DEPTS.includes(dept) && dept !== OTHER) throw new Bad("Your account is missing a valid department. Please update your student account.");
      if (course.length < 3) throw new Bad("Select your course.");
      if (org.length < 2) throw new Bad("Enter the name of the organization.");
      if (loc.length < 5) throw new Bad("Describe where the organization is, e.g. \"near Naivas, Njoro Road\".");
      if (sup.length < 3) throw new Bad("Enter your supervisor's name.");
      if (supTel.replace(/\D/g, "").length < 9) throw new Bad("Enter a valid supervisor contact number.");
      if (town.length < 2) throw new Bad("Enter the town.");
      if (county.length < 2) throw new Bad("Select the county.");
      if (tel1.replace(/\D/g, "").length < 9) throw new Bad("Enter phone number 1 (at least 9 digits).");
      if (tel2 && tel2.replace(/\D/g, "").length < 9) throw new Bad("Phone number 2 must have at least 9 digits, or leave it empty.");
      const all = await getJSON(s, "placements", {}), id = sid(n, a), old = all[id];
      if (!old && Object.keys(all).length >= 20000) throw new Bad("The list is full. Please contact the Industrial Liaison Office.");
      all[id] = { n, a, cls, dept, course, org, loc, sup, supTel, town: town.toUpperCase(), county, tel1, tel2, t: old ? old.t : Date.now(), u: Date.now(), ...(old && old.tid && { tid: old.tid, tby: old.tby }), ...(old && old.sd && { sd: old.sd }), ...(old && old.ed && { ed: old.ed }) };
      await s.setJSON("placements", all);
      return json({ ok: true, updated: !!old });
    }
    if (method === "GET" && path === "placement-towns") {
      const all = await getJSON(s, "placements", {}), by = {};
      for (const r of Object.values(all)) if (r.county && r.town) (by[r.county] = by[r.county] || new Set()).add(r.town);
      return json({ towns: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, [...v].sort()])) });
    }
    if (method === "GET" && path === "placement-me") {
      const acct = await currentAccount(req,s); if(!requireRole(acct,["student"])) return fail("Please sign in as a student.",401);
      const all = await getJSON(s,"placements",{}), trainers = await getJSON(s,"trainers",{}), r = all[sid(acct.name,acct.adm)];
      const t = r && r.tid ? trainers[r.tid] : null;
      return json({ hasPlacement:!!r, placement:r?{org:r.org,town:r.town,county:r.county,loc:r.loc,sup:r.sup,supTel:r.supTel,course:r.course}:null, trainer:t?{name:t.name,tel:t.tel}:null });
    }
    if (method === "POST" && path === "placement-search") {
      const q = clean(body.q, 60).toUpperCase(), compact = q.replace(/[^A-Z0-9]/g, "");
      if (compact.length < 3) return json({ matches: [] });
      const words = q.replace(/[^A-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean), qAdm = normAdm(q);
      const all = await getJSON(s, "placements", {}), trainers = await getJSON(s, "trainers", {});
      const out = [];
      for (const r of Object.values(all)) {
        const nm = r.n.replace(/[^A-Z0-9\s]/g, " ");
        if (!((qAdm.length >= 3 && normAdm(r.a).includes(qAdm)) || words.every((w) => nm.includes(w)))) continue;
        const t = r.tid && trainers[r.tid];
        out.push({ n: r.n, a: r.a, course: r.course, org: r.org, loc: r.loc, town: r.town, sup: r.sup, trainer: t ? { name: t.name, tel: t.tel } : null });
      }
      out.sort((x, y) => x.n.localeCompare(y.n));
      return json({ matches: out.slice(0, 8) });
    }
    if (method === "GET" && path === "register-info") {
      const students = await getJSON(s, "students", {}), reg = await getJSON(s, "register", {});
      const set = new Set();
      for (const r of [...Object.values(students), ...Object.values(reg)]) if (r.c) set.add(r.c);
      return json({ classes: [...set].sort() });
    }
    if (method === "POST" && path === "register") {
      const n = clean(body.name, 120).toUpperCase(), a = clean(body.adm, 60).toUpperCase().replace(/\s+/g, ""),
        c = clean(body.cls, 40).toUpperCase().replace(/\s+/g, ""), tel = String(body.tel || "").trim(), pin=String(body.pin||"");
      if (n.length < 3 || a.length < 4 || c.length < 2 || digits(tel).replace(/\D/g,"").length < 9) throw new Bad("Fill in your full name, admission number, class and a valid phone number.");
      if(pin && (pin.length<6 || pin.length>12 || !/^\d+$/.test(pin))) throw new Bad("Use a 6-12 digit PIN.");
      const reg = await getJSON(s, "register", {}), id = sid(n, a), updated = !!reg[id];
      reg[id] = { ...(reg[id] || {}), n, a, c, tel: digits(tel), t: Date.now() };
      await s.setJSON("register", reg);
      if(pin) {
        const accounts=await getJSON(s,"accounts",{});
        const old=Object.values(accounts).find(x=>x.role==="student"&&x.adm===a);
        const aid=old?old.id:"S"+Date.now().toString(36)+randomBytes(3).toString("hex"), salt=randomBytes(16).toString("hex");
        accounts[aid]={id:aid,role:"student",name:n,adm:a,cls:c,phone:digits(tel),salt,pinHash:pinHash(pin,salt),status:"approved",createdAt:old?.createdAt||Date.now(),updatedAt:Date.now()};
        reg[id].accountId=aid;
        await s.setJSON("accounts",accounts); await s.setJSON("register",reg);
      }
      return json({ ok: true, updated });
    }
    if (method === "GET" && path === "ilo-info") {
      const students = await getJSON(s, "students", {}), rules = await getJSON(s, "classpol", {});
      const cnt = {};
      for (const r of Object.values(students)) cnt[r.c] = (cnt[r.c] || 0) + 1;
      const settings = await getJSON(s, "settings", DEFAULT_SETTINGS);
      return json({
        classes: Object.keys(cnt).filter(Boolean).sort().map((c) => ({ c, n: cnt[c], pid: rules[c] || "" })),
        policies: await getJSON(s, "policies", []),
        def: settings,
      });
    }
    if (method === "POST" && path === "ilo-policy") {
      const acct=await currentAccount(req,s); if(!requireRole(acct,["rep"])) return fail("Please sign in as an approved ILO representative.",401);
      body.rep = acct.name; body.phone = acct.phone;
      const cls = clean(body.cls, 40), rep = clean(body.rep, 80), phone = clean(body.phone, 30), choice = clean(body.choice, 30);
      if (rep.length < 3) throw new Bad("Enter your name.");
      if (cls.length < 2) throw new Bad("Choose the class.");
      const policies = await getJSON(s, "policies", []);
      const sub = { kind: "policy", cls, pid: "", newPolicy: null, rep, phone, t: Date.now() };
      if (choice === "new") {
        try { const v = cleanSettings(body.np || {}); sub.newPolicy = v; } catch (e) { throw new Bad("Policy details: " + e.message); }
      } else if (choice && choice !== "default") {
        if (!policies.some((x) => x.id === choice)) throw new Bad("That policy was not found. Refresh the page and try again.");
        sub.pid = choice;
      } else if (choice !== "default") throw new Bad("Choose which insurance policy the class uses.");
      const all = await getJSON(s, "ilo", {});
      if (Object.keys(all).length >= 500) throw new Bad("Too many waiting submissions. Please contact the Industrial Liaison Office.");
      all[Date.now().toString(36) + Math.random().toString(36).slice(2, 6)] = sub;
      await s.setJSON("ilo", all);
      return json({ ok: true });
    }
    if (method === "POST" && path === "ilo") {
      const acct=await currentAccount(req,s); if(!requireRole(acct,["rep"])) return fail("Please sign in as an approved ILO representative.",401);
      const courses = await loadCourses(s);
      body.dept = acct.dept; body.rep = acct.name; body.phone = acct.phone;
      const key = clean(body.key, 30), rep = clean(body.rep, 80), phone = clean(body.phone, 30);
      const percent = Number(body.percent);
      const units = (Array.isArray(body.units) ? body.units : String(body.units || "").split("\n")).map((u) => clean(u, 120)).filter(Boolean).slice(0, 60);
      if (rep.length < 3) throw new Bad("Enter your name.");
      if (!(percent >= 0 && percent <= 100) || body.percent === "" || body.percent == null) throw new Bad("Enter the coursework covered so far, between 0 and 100.");
      if (!units.length) throw new Bad("Add at least one unit.");
      let title, dept, newTitle = "";
      if (key) {
        const c = courses.find((x) => x.key === key);
        if (!c) throw new Bad("That course was not found. Refresh the page and try again.");
        title = c.title; dept = c.dept;
      } else {
        newTitle = clean(body.newTitle, 120).toUpperCase(); dept = clean(body.dept, 80);
        if (newTitle.length < 3) throw new Bad("Choose a course, or type the name of the course (with its level).");
        if (!DEPTS.includes(dept)) throw new Bad("Choose the department.");
        title = newTitle;
      }
      const all = await getJSON(s, "ilo", {});
      if (Object.keys(all).length >= 500) throw new Bad("Too many waiting submissions. Please contact the Industrial Liaison Office.");
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      all[id] = { key, newTitle, title, dept, percent, units, rep, phone, t: Date.now() };
      await s.setJSON("ilo", all);
      return json({ ok: true });
    }
    /* ----- yearly renewal: an expired cover moves the student to the newest valid policy (class policy, else default) ----- */
    if (method === "POST" && path === "renew") {
      const acct = await currentAccount(req, s); if (!requireRole(acct, ["student"])) return fail("Please sign in as a student.", 401);
      const name = clean(body.name), adm = clean(body.adm, 60);
      if (normAdm(adm) !== normAdm(acct.adm)) return fail("This is not your record.", 403);
      const students = await getJSON(s, "students", {}), id = sid(name, adm), rec = students[id];
      if (!rec) return fail("No cover is on file for you yet.");
      const settings = await getJSON(s, "settings", DEFAULT_SETTINGS), pols = await getJSON(s, "policies", []), rules = await getJSON(s, "classpol", {});
      const cur = effective(rec, settings, pols), today = new Date().toISOString().slice(0, 10);
      if (cur.e >= today) return json({ ok: true, renewed: false, record: cur, settings });
      const cp = pols.find((x) => x.id === rules[rec.c]);
      const nb = [cp, settings].find((b) => b && b.policyEnd >= today && b.policyEnd > cur.e);
      if (!nb) return fail("Your cover expired on " + cur.e.split("-").reverse().join("/") + ". The new year's policy has not been loaded yet. Please ask the Industrial Liaison Office.");
      rec.hist = (rec.hist || []).concat({ p: cur.p, i: cur.i, s: cur.s, e: cur.e, at: Date.now() }).slice(-10);
      delete rec.p; delete rec.i; delete rec.s; delete rec.e; rec.pid = nb === cp ? cp.id : "";
      students[id] = rec; await s.setJSON("students", students);
      await audit(s, { type: "cover renewed " + rec.a, by: acct.name, role: "student" });
      return json({ ok: true, renewed: true, record: effective(rec, settings, pols), settings });
    }

    if (method === "POST" && path === "lookup") {
      const acct=await currentAccount(req,s); if(!requireRole(acct,["student"])) return fail("Please sign in as a student.",401);
      const name = clean(body.name), adm = clean(body.adm, 60);
      if(normAdm(adm)!==normAdm(acct.adm)) return json({found:false});
      if (name.length < 3 || adm.length < 6) return json({ found: false });
      const students = await getJSON(s, "students", {});
      const rec = students[sid(name, adm)];
      if (!rec) return json({ found: false });
      const settings = await getJSON(s, "settings", DEFAULT_SETTINGS);
      return json({ found: true, record: effective(rec, settings, await getJSON(s, "policies", [])), settings });
    }

    if (method === "POST" && path === "search") {
      const acct=await currentAccount(req,s); if(!requireRole(acct,["student"])) return fail("Please sign in as a student.",401);
      const q = clean(body.q, 60).toUpperCase();
      if(!normAdm(acct.adm).includes(normAdm(q)) && !acct.name.includes(q)) return json({matches:[]});
      const compact = q.replace(/[^A-Z0-9]/g, "");
      if (compact.length < 3) return json({ matches: [] });
      const qAdm = normAdm(q), words = q.replace(/[`'\u2019]/g, "").replace(/[^A-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
      const students = await getJSON(s, "students", {});
      const out = [];
      for (const r of Object.values(students)) {
        const nm = String(r.n).toUpperCase().replace(/[`'\u2019]/g, "").replace(/[^A-Z0-9\s]/g, " ");
        const adm = normAdm(r.a);
        const byAdm = qAdm.length >= 3 && adm.includes(qAdm);
        const byName = words.length > 0 && words.every((w) => nm.includes(w));
        if (!byAdm && !byName) continue;
        const rank = (adm.startsWith(qAdm) || nm.startsWith(words[0] || "~")) ? 0 : 1;
        out.push({ rank, n: r.n, r });
      }
      out.sort((x, y) => x.rank - y.rank || x.n.localeCompare(y.n));
      const settings = await getJSON(s, "settings", DEFAULT_SETTINGS), pols = await getJSON(s, "policies", []);
      return json({ matches: out.slice(0, 8).map((o) => effective(o.r, settings, pols)), settings });
    }

    if (method === "POST" && path === "request") {
      const acct=await currentAccount(req,s); if(!requireRole(acct,["student"])) return fail("Please sign in as a student.",401);
      const n = acct.name, a = acct.adm,
        c = acct.cls, course = clean(body.course, 120).toUpperCase();
      if (n.length < 3 || a.length < 4 || c.length < 2 || course.length < 2) return fail("Fill in your full name, class, course and admission number.");
      const id = sid(n, a);
      const students = await getJSON(s, "students", {});
      if (students[id]) return json({ ok: true, already: true });
      const reqs = await getJSON(s, "requests", {});
      if (!reqs[id] && Object.keys(reqs).length >= 5000) return fail("Requests are full right now. Please see the Industrial Liaison Office.");
      reqs[id] = { n, a, c, course, dept: acct.dept || "", t: Date.now() };
      await s.setJSON("requests", reqs);
      return json({ ok: true });
    }

    /* ----- ILO representative insurance-request approval ----- */
    if (method === "GET" && path === "ilo/requests") {
      const acct = await currentAccount(req, s);
      if (!requireRole(acct, ["rep"])) return fail("Please sign in as an approved ILO representative.", 401);
      const reqs = await getJSON(s, "requests", {});
      const list = Object.entries(reqs)
        .filter(([, r]) => !r.dept || r.dept === acct.dept)
        .map(([id, r]) => ({ id, ...r }))
        .sort((a, b) => (a.t || 0) - (b.t || 0));
      return json({ requests: list, department: acct.dept || "" });
    }
    if (method === "POST" && path === "ilo/requests/approve") {
      const acct = await currentAccount(req, s);
      if (!requireRole(acct, ["rep"])) return fail("Please sign in as an approved ILO representative.", 401);
      const id = clean(body.id, 200);
      const reqs = await getJSON(s, "requests", {}), r = reqs[id];
      if (!r) throw new Bad("That insurance request is no longer waiting.");
      if (r.dept && r.dept !== acct.dept) return fail("You can only approve requests from your department.", 403);
      const students = await getJSON(s, "students", {});
      const settings = await getJSON(s, "settings", DEFAULT_SETTINGS);
      const policies = await getJSON(s, "policies", []), rules = await getJSON(s, "classpol", {});
      const pid = rules[r.c] && policies.some((x) => x.id === rules[r.c]) ? rules[r.c] : "";
      students[id] = { n: r.n, a: r.a, c: r.c, ...(pid ? { pid } : {}), approvedBy: acct.name, approvedAt: Date.now() };
      delete reqs[id];
      await s.setJSON("students", students);
      await s.setJSON("requests", reqs);
      return json({ ok: true, approved: 1, total: Object.keys(students).length, requests: Object.keys(reqs).length, settings });
    }

    /* ----- student marks (student can view only their own score) ----- */
    if (method === "GET" && path === "marks-me") {
      const acct = await currentAccount(req, s);
      if (!requireRole(acct, ["student"])) return fail("Please sign in as a student.", 401);
      const marks = await getJSON(s, "marks", {});
      const reg = await getJSON(s, "register", {}), students = await getJSON(s, "students", {});
      let recordId = Object.keys(reg).find(id => reg[id] && reg[id].accountId === acct.id);
      if (!recordId) recordId = Object.keys(reg).find(id => reg[id] && normAdm(reg[id].a) === normAdm(acct.adm));
      if (!recordId) recordId = Object.keys(students).find(id => students[id] && normAdm(students[id].a) === normAdm(acct.adm));
      const m = recordId ? marks[recordId] : marks[acct.id];
      return json({
        found: !!m,
        name: acct.name || "",
        adm: acct.adm || "",
        cls: acct.cls || "",
        dept: acct.dept || "",
        score: m ? Number(m.m) : null,
        outOf: 100,
        updatedAt: m ? m.u : null
      });
    }

    /* ----- marks (admin / HOD see everything; an ILO representative sees only their department, with a code) ----- */
    if (path.startsWith("marks")) {
      const tok = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
      const acct = await currentAccount(req,s);
      const isAdmin = !!tok && validToken(tok), isHod = isAdmin || requireRole(acct,["hod","deputy"]);
      let repDept = "";
      if (!isHod) {
        if (requireRole(acct,["rep"])) repDept = acct.dept;
        else return fail("Please sign in with an approved portal account.",401);
      }
      const students = await getJSON(s, "students", {}), reg = await getJSON(s, "register", {});
      const placements = await getJSON(s, "placements", {}), marks = await getJSON(s, "marks", {}), trainers = await getJSON(s, "trainers", {});
      const cdept = await getJSON(s, "classdept", {}), classlocks = await getJSON(s, "classlocks", {});
      const codes = await getJSON(s, "ilocodes", {});
      /* everyone in the database (cover list + student details), once each */
      const people = new Map();
      for (const [id, r] of Object.entries(reg)) people.set(id, { id, n: r.n, a: r.a, c: r.c || "" });
      for (const [id, r] of Object.entries(students)) people.set(id, { id, n: r.n, a: r.a, c: r.c || (people.get(id) || {}).c || "" });
      const inferred = {};
      for (const p of people.values()) {
        const pl = placements[p.id]; if (!p.c || !pl || !pl.dept) continue;
        (inferred[p.c] = inferred[p.c] || {})[pl.dept] = ((inferred[p.c] || {})[pl.dept] || 0) + 1;
      }
      const deptOf = (c) => {
        if (cdept[c]) return cdept[c];
        const o = inferred[c]; if (!o) return "Not yet assigned";
        return Object.entries(o).sort((a, b) => b[1] - a[1])[0][0];
      };
      const build = () => {
        const byClass = {};
        for (const p of people.values()) {
          const c = p.c || "NO CLASS"; const d = p.c ? deptOf(p.c) : "Not yet assigned";
          if (repDept && d !== repDept) continue;
          const pl = placements[p.id], m = marks[p.id];
          if (!pl && !m) continue; /* only placed students are assessed */
          const g = byClass[c] || (byClass[c] = { c, dept: d, students: [], locked: !!classlocks[c] });
          const tr = pl && pl.tid && trainers[pl.tid] ? trainers[pl.tid].name : "";
          g.students.push({ n: p.n, a: p.a, m: m ? m.m : null, o: m ? 100 : null, pct: m ? Math.round(m.m * 10) / 10 : null, course: pl ? pl.course : "", tr, lk: !!(m && m.locked), u: m ? m.u : null });
        }
        const classes = Object.values(byClass).sort((x, y) => (x.dept + "|" + x.c).localeCompare(y.dept + "|" + y.c));
        for (const g of classes) g.students.sort((x, y) => x.n.localeCompare(y.n));
        const P = { dept: {}, course: {}, cls: {} }, bump = (o, k, e) => { const x = o[k] || (o[k] = { k, total: 0, entered: 0 }); x.total++; if (e) x.entered++; };
        for (const g of classes) for (const x of g.students) {
          const e = x.m != null; bump(P.dept, g.dept, e); bump(P.course, (x.course || "No course") + " (" + g.dept + ")", e); bump(P.cls, g.c, e);
        }
        const fin = (o) => Object.values(o).map((x) => ({ ...x, pct: x.total ? Math.round((x.entered / x.total) * 1000) / 10 : 0 })).sort((a, b) => a.k.localeCompare(b.k));
        return { progress: { dept: fin(P.dept), course: fin(P.course), cls: fin(P.cls) }, classes, departments: repDept ? [repDept] : DEPTS.concat(OTHER, "Not yet assigned"), role: repDept ? "rep" : isAdmin ? "admin" : "hod", codes: isAdmin ? Object.keys(codes) : undefined };
      };
      if ((method === "GET" || method === "POST") && path === "marks/data") return json(build());
      /* ----- standard marksheet templates (kept per department) ----- */
      if (method === "POST" && path.startsWith("marks/template")) {
        const d = repDept || clean(body.dept, 80);
        if (!d || (!DEPTS.includes(d) && d !== OTHER)) throw new Bad("Choose a department first.");
        const meta = await getJSON(s, "mtmeta", {});
        const list = () => Object.entries(meta).filter(([, m]) => m.dept === d).map(([id, m]) => ({ id, name: m.name, size: m.size, t: m.t })).sort((a, b) => b.t - a.t);
        if (path === "marks/templates") return json({ templates: list() });
        if (path === "marks/template-add") {
          const name = clean(body.name, 100), data = String(body.data || "");
          if (!/\.xlsx$/i.test(name)) throw new Bad("Upload an Excel file saved as .xlsx (in Excel: Save As, Excel Workbook).");
          if (!data || data.length > 5.6e6) throw new Bad("The file is empty or larger than 4 MB.");
          if (list().length >= 50) throw new Bad("This department already has 50 marksheets. Remove one first.");
          const id = "M" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
          await s.setJSON("mt:" + id, { data });
          meta[id] = { dept: d, name, size: Math.round(data.length * 0.75), t: Date.now() };
          await s.setJSON("mtmeta", meta);
          return json({ templates: list() });
        }
        const id = clean(body.id, 30);
        if (path === "marks/template-get") {
          if (!meta[id] || meta[id].dept !== d) throw new Bad("That marksheet was not found.");
          const f = await getJSON(s, "mt:" + id, null);
          if (!f) throw new Bad("That marksheet was not found.");
          return json({ name: meta[id].name, data: f.data });
        }
        if (path === "marks/template-del") {
          if (!meta[id] || meta[id].dept !== d) throw new Bad("That marksheet was not found.");
          delete meta[id]; await s.setJSON("mtmeta", meta); await s.setJSON("mt:" + id, { data: "" });
          return json({ templates: list() });
        }
        return fail("Not found", 404);
      }
      if (method === "POST" && path === "marks/upload") {
        if (!requireRole(acct,["rep"])) return fail("Only an ILO Representative can record or edit attachment marks.",403);
        const rows = Array.isArray(body.rows) ? body.rows.slice(0, 20000) : [];
        { const fresh = await getJSON(s, "marks", {}); for (const k of Object.keys(marks)) delete marks[k]; Object.assign(marks, fresh); } /* re-read just before writing so two reps do not overwrite each other */
        const lockedList = [], log = [];
        /* a representative can only change marks of students in their own department's classes */
        const byAdm = new Map(); let other = 0; const otherList = [];
        for (const p of people.values()) {
          if (repDept && (!p.c || deptOf(p.c) !== repDept)) { byAdm.set(normAdm(p.a), null); continue; }
          if (!placements[p.id] && !marks[p.id]) { byAdm.set(normAdm(p.a), undefined); continue; }
          byAdm.set(normAdm(p.a), p.id);
        }
        let saved = 0, cleared = 0; const unmatched = [], invalid = [];
        for (const r of rows) {
          const a = clean(r.a, 60); if (!a) continue;
          const k = normAdm(a), id = byAdm.get(k);
          if (id === null) { other++; if (otherList.length < 50) otherList.push(a); continue; }
          if (!id) { unmatched.push(a); continue; }
          const raw = String(r.m ?? "").trim();
          { const cl = classlocks[(people.get(id) || {}).c]; if ((marks[id] && marks[id].locked) || (cl && !(marks[id] && marks[id].locked === false))) { lockedList.push(a); continue; } }
          if (raw === "") { if (r.clear === true && marks[id]) { log.push({ id, a, old: marks[id].m, nw: null }); delete marks[id]; cleared++; } continue; }
          const m = Number(String(raw).replace("%", ""));
          if (!(m >= 0) || m > 100 || isNaN(m)) { invalid.push(a); continue; }
          log.push({ id, a, old: marks[id] ? marks[id].m : null, nw: m });
          marks[id] = { m, o: 100, u: Date.now(), by: acct.id, locked: !!classlocks[(people.get(id) || {}).c] }; saved++;
        }
        await s.setJSON("marks", marks);
        for (const l of log) await audit(s, { type: "mark", adm: l.a, old: l.old, nw: l.nw, by: acct.name, role: "rep", dept: acct.dept });
        return json({ locked: lockedList.slice(0, 50), lockedCount: lockedList.length, saved, cleared, unmatched: unmatched.slice(0, 50), unmatchedCount: unmatched.length, invalid: invalid.slice(0, 50), invalidCount: invalid.length, otherDept: otherList, otherDeptCount: other, ...build() });
      }
      if (method === "POST" && path === "marks/lockclass") {
        if (!requireRole(acct, ["rep"])) return fail("Only an ILO Representative can lock a class.", 403);
        const c = clean(body.c, 40); if (!c || !people.size || deptOf(c) !== repDept) throw new Bad("Choose one of your department's classes.");
        const fresh = await getJSON(s, "marks", {}); let n = 0;
        for (const p of people.values()) if (p.c === c && fresh[p.id]) { fresh[p.id].locked = true; n++; }
        classlocks[c] = { by: acct.name, t: Date.now() };
        await s.setJSON("marks", fresh); await s.setJSON("classlocks", classlocks);
        for (const k of Object.keys(marks)) delete marks[k]; Object.assign(marks, fresh);
        await audit(s, { type: "lock-class", adm: c, old: n, nw: null, by: acct.name, role: "rep", dept: repDept });
        return json(build());
      }
      if (!isHod) return fail("Not allowed.", 403);
      if (method === "POST" && path === "marks/unlock") {
        if (!requireRole(acct, ["hod", "deputy"])) return fail("Only the HOD or Deputy HOD can unlock a mark.", 403);
        const reason = clean(body.reason, 300), a = normAdm(clean(body.a, 60));
        if (reason.length < 5) throw new Bad("Give the reason for the correction (at least 5 letters).");
        const fresh = await getJSON(s, "marks", {}), pid = [...people.values()].find((p) => normAdm(p.a) === a);
        if (!pid || !fresh[pid.id]) throw new Bad("That student has no saved mark.");
        if (!fresh[pid.id].locked) throw new Bad("That mark is already unlocked.");
        fresh[pid.id].locked = false; await s.setJSON("marks", fresh);
        await audit(s, { type: "unlock", adm: pid.a, old: fresh[pid.id].m, nw: null, by: acct.name, role: acct.role, reason });
        for (const k of Object.keys(marks)) delete marks[k]; Object.assign(marks, fresh);
        return json(build());
      }
      if (method === "POST" && path === "marks/unlockclass") {
        if (!requireRole(acct, ["hod", "deputy"])) return fail("Only the HOD or Deputy HOD can unlock a class.", 403);
        const c = clean(body.c, 40), reason = clean(body.reason, 300);
        if (reason.length < 5) throw new Bad("Give the reason (at least 5 letters).");
        if (!classlocks[c]) throw new Bad("That class is not locked.");
        const fresh = await getJSON(s, "marks", {}); let n = 0;
        for (const p of people.values()) if (p.c === c && fresh[p.id]) { fresh[p.id].locked = false; n++; }
        delete classlocks[c]; await s.setJSON("marks", fresh); await s.setJSON("classlocks", classlocks);
        for (const k of Object.keys(marks)) delete marks[k]; Object.assign(marks, fresh);
        await audit(s, { type: "unlock-class", adm: c, old: n, nw: null, by: acct.name, role: acct.role, reason });
        return json(build());
      }
      if (method === "POST" && path === "marks/audit") {
        const a = await getJSON(s, "audit", []);
        return json({ audit: a.slice(-300).reverse() });
      }
      if (method === "POST" && path === "marks/classdept") {
        const c = clean(body.c, 40), d = clean(body.dept, 80);
        if (!c) throw new Bad("Choose the class.");
        if (d && !DEPTS.includes(d) && d !== OTHER) throw new Bad("Choose a department.");
        if (d) cdept[c] = d; else delete cdept[c];
        await s.setJSON("classdept", cdept);
        return json(build());
      }
      if (method === "POST" && path === "marks/ilocode") {
        if (!isAdmin) return fail("Only the administrator can set department codes.", 403);
        const d = clean(body.dept, 80), code = String(body.code || "").trim();
        if (!DEPTS.includes(d) && d !== OTHER) throw new Bad("Choose a department.");
        if (!code) { delete codes[d]; } else {
          if (code.length < 6) throw new Bad("Use a code of at least 6 characters.");
          codes[d] = iloHash(code);
        }
        await s.setJSON("ilocodes", codes);
        return json(build());
      }
      return fail("Not found", 404);
    }

    /* ----- trainers (no account: they open the link or type the access code they were sent) ----- */
    if (path === "trainer/me" || path === "trainer/details") {
      const code = cleanAccess(method === "GET" ? url.searchParams.get("t") : body.t);
      const trainers = await getJSON(s, "trainers", {});
      const tid = code.length === 10 ? Object.keys(trainers).find((k) => trainers[k].tok === code) : "";
      if (!tid) { await new Promise((r) => setTimeout(r, 800)); return fail("That link or access code is not valid. Ask the ILO office to send it again.", 404); }
      const t = trainers[tid], all = await getJSON(s, "placements", {});
      const mine = () => Object.values(all).filter((r) => r.tid === tid).map((r) => ({ n: r.n, a: r.a, cls: r.cls || "", dept: r.dept || "", course: r.course || "", org: r.org || "", loc: r.loc || "", town: cleanTown(r.town).toUpperCase(), county: r.county || "", sup: r.sup || "", supTel: r.supTel || "", tel1: r.tel1 || "", tel2: r.tel2 || "", sd: r.sd || "", ed: r.ed || "" })).sort((x, y) => (x.cls + x.n).localeCompare(y.cls + y.n));
      const me = () => ({ name: t.name, tel: t.tel || "", email: t.email || "", code: showCode(t.tok), det: t.det || null, students: mine() });
      if (method === "GET") {
        if (!t.openedAt) { t.openedAt = Date.now(); await s.setJSON("trainers", trainers); }
        return json(me());
      }
      if (method === "POST") {
        const name = clean(body.name, 80).toUpperCase(), pf = clean(body.pf, 20).toUpperCase().replace(/\s+/g, ""), idno = clean(body.idno, 12).toUpperCase().replace(/[\s-]/g, "");
        const bank = clean(body.bank, 60), branch = clean(body.branch, 60), acct = clean(body.acct, 24).replace(/[^0-9A-Za-z]/g, ""), email = clean(body.email, 200).toLowerCase(), tel = digits(body.tel);
        if (name.length < 3 || name.split(" ").length < 2) throw new Bad("Enter your full name (at least two names).");
        if (!/^[A-Z0-9\/-]{2,20}$/.test(pf)) throw new Bad("Enter your PF number (letters and digits only).");
        if (!/^[A-Z0-9]{6,12}$/.test(idno)) throw new Bad("Enter your ID number (6 to 12 letters or digits).");
        if (bank.length < 2) throw new Bad("Choose or type your bank.");
        if (branch.length < 2) throw new Bad("Enter your bank branch.");
        if (acct && (acct.length < 6 || acct.length > 20)) throw new Bad("The account number should be 6 to 20 characters. Leave it empty if you prefer not to give it.");
        if (email && !EMAIL_RE.test(email)) throw new Bad("That email address does not look right.");
        if (tel.replace(/\D/g, "").length < 9) throw new Bad("Enter your phone number (the one on WhatsApp if you can).");
        for (const [k, o] of Object.entries(trainers)) if (k !== tid && o.det && (o.det.pf === pf || o.det.idno === idno)) throw new Bad("Those details match another trainer already on the list. Check the PF and ID numbers, or ask the ILO office for help.");
        const first = !t.det;
        t.det = { name, pf, idno, bank, branch, acct, at: Date.now(), v: ((t.det && t.det.v) || 0) + 1 };
        if (email) t.email = email; t.tel = tel;
        await s.setJSON("trainers", trainers);
        await audit(s, { type: first ? "trainer details received" : "trainer details updated", trainer: t.name, by: name, role: "trainer" });
        if (first && t.email) { try { await within(mailTo(t.email, "RVNP: your details were received", "Hello " + name + ",\n\nThank you. The ILO office has received your details. You can open your page again at any time to download your students list:\n" + baseUrl(req) + "/trainer.html?t=" + t.tok + "\n\nRVNP Industrial Liaison Office"), 6000); } catch (e) {} }
        return json(me());
      }
      return fail("Not found", 404);
    }

    /* ----- ILO HOD / deputy HOD (access code) ----- */
    if (path === "hod" || path.startsWith("hod/")) {
      const acct=await currentAccount(req,s), admTok=(req.headers.get("authorization")||"").replace(/^Bearer /,""); if (!(admTok && validToken(admTok)) && !requireRole(acct,["hod","deputy"])) { await new Promise((r) => setTimeout(r, 800)); return fail("Please sign in as an approved HOD or Deputy HOD.", 401); }
      const all = await getJSON(s, "placements", {}), trainers = await getJSON(s, "trainers", {});
      { let fixed = false; for (const t of Object.values(trainers)) if (!t.tok) { t.tok = newCode(); fixed = true; } if (fixed) await s.setJSON("trainers", trainers); }   /* trainers added before access codes existed get one now */
      const byRole = admTok && validToken(admTok) ? "admin" : acct.role, byName = admTok && validToken(admTok) ? "Administrator" : acct.name;
      const base = baseUrl(req);
      const view = () => {
        const cnt = {};
        for (const r of Object.values(all)) if (r.tid && trainers[r.tid]) cnt[r.tid] = (cnt[r.tid] || 0) + 1;
        return {
          placements: Object.entries(all).map(([id, r]) => ({ id, ...r, town: cleanTown(r.town).toUpperCase(), tid: r.tid && trainers[r.tid] ? r.tid : "" }))
            .sort((x, y) => (x.dept + x.course + x.n).localeCompare(y.dept + y.course + y.n)),
          trainers: Object.entries(trainers).map(([id, t]) => {
            const { tok, ...rest } = t, n = cnt[id] || 0, link = base + "/trainer.html?t=" + tok, m = trainerMsg(t, n, link, tok);
            return { id, ...rest, count: n, code: showCode(tok), link, text: m.short, wnum: intl(t.tel) };
          }).sort((x, y) => x.name.localeCompare(y.name)),
          departments: DEPTS.concat(OTHER),
          channels: chanOn(),
        };
      };
      if (method === "GET" && path === "hod/data") return json(view());
      /* every registered student, for the search and the department, course and class views (Admin, HOD, Deputy HOD).
         The list is the student register (the same list the Admin removes students from), joined with each student's saved account details. */
      if (method === "GET" && path === "hod/directory") {
        const accts = await getJSON(s, "accounts", {}), reg = await getJSON(s, "register", {}), covers = await getJSON(s, "students", {}), byAdm = {}, out = [];
        for (const a of Object.values(accts)) if (a.role === "student") byAdm[normAdm(a.adm)] = a;
        const place = (n, a) => { const r = all[sid(n, a)]; if (!r) return {}; const t = r.tid && trainers[r.tid]; return { pl: 1, org: r.org || "", loc: r.loc || "", town: cleanTown(r.town).toUpperCase(), county: r.county || "", sup: r.sup || "", supTel: r.supTel || "", tr: t ? t.name : "", trTel: t ? t.tel : "", tby: r.tby || "" }; };
        for (const [rid, r] of Object.entries(reg)) {
          const a = (r.accountId && accts[r.accountId]) || byAdm[normAdm(r.a)];
          if (a && a.status !== "approved") continue;
          const n = (a && a.name) || r.n, adm = (a && a.adm) || r.a;
          out.push({ rid, n, a: adm, c: (a && a.cls) || r.c || "", cp: !!(a && a.clsPending), d: (a && a.dept) || "", co: (a && a.course) || "", it: (a && a.intake) || "", g: (a && a.gender) || "", ph: (a && a.phone) || r.tel || "", ph2: (a && a.altPhone) || "", em: (a && a.email) || "", cv: !!covers[rid], ...place(n, adm) });
        }
        out.sort((x, y) => (x.c + "|" + x.n).localeCompare(y.c + "|" + y.n));
        const cs = await loadCourses(s);
        return json({ students: out, departments: DEPTS.concat(OTHER), courses: cs.map((c) => ({ dept: c.dept, title: c.title })) });
      }
      if (method === "POST" && path === "hod/trainers") {
        const name = clean(body.name, 80), tel = digits(body.tel), email = clean(body.email, 200).toLowerCase();
        if (name.length < 3) throw new Bad("Enter the trainer's name.");
        if (tel.replace(/\D/g, "").length < 9) throw new Bad("Enter the trainer's phone number (at least 9 digits). It is used for WhatsApp.");
        if (email && !EMAIL_RE.test(email)) throw new Bad("That email address does not look right. Leave it empty if you do not have it.");
        if (Object.values(trainers).some((t) => t.name.toLowerCase() === name.toLowerCase())) throw new Bad("A trainer called \"" + name + "\" is already on the list.");
        if (Object.keys(trainers).length >= 300) throw new Bad("Too many trainers.");
        let tok = newCode(); while (Object.values(trainers).some((t) => t.tok === tok)) tok = newCode();
        trainers["T" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4)] = { name, tel, ...(email && { email }), tok, addedAt: Date.now() };
        await s.setJSON("trainers", trainers);
        return json(view());
      }
      if (method === "PUT" && path.startsWith("hod/trainers/")) {
        const id = path.split("/")[2], t = trainers[id];
        if (!t) throw new Bad("That trainer is no longer on the list.");
        const name = clean(body.name, 80), tel = digits(body.tel), email = clean(body.email, 200).toLowerCase();
        if (name.length < 3) throw new Bad("Enter the trainer's name.");
        if (tel.replace(/\D/g, "").length < 9) throw new Bad("Enter the trainer's phone number (at least 9 digits).");
        if (email && !EMAIL_RE.test(email)) throw new Bad("That email address does not look right.");
        if (Object.entries(trainers).some(([k, o]) => k !== id && o.name.toLowerCase() === name.toLowerCase())) throw new Bad("Another trainer already has that name.");
        t.name = name; t.tel = tel; if (email) t.email = email; else delete t.email;
        await s.setJSON("trainers", trainers);
        await audit(s, { type: "trainer contact changed: " + name, by: byName, role: byRole });
        return json(view());
      }
      /* send the link (message with the access code) to chosen trainers now: all channels that are set up, or just the ones named */
      if (method === "POST" && path === "hod/trainers/notify") {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map((x) => clean(x, 30)).filter((x) => trainers[x]).slice(0, 15);
        if (!ids.length) throw new Bad("Choose at least one trainer.");
        const only = Array.isArray(body.channels) ? body.channels.filter((c) => CHANNELS.includes(c)) : [];
        const results = [];
        for (const id of ids) {
          const t = trainers[id], res = await deliver(req, t, trainerCount(all, id), only);
          results.push({ id, name: t.name, res });
          await audit(s, { type: "trainer message", trainer: t.name, result: res, by: byName, role: byRole });
        }
        await s.setJSON("trainers", trainers);
        return json({ results, ...view() });
      }
      /* the HOD printed or handed over a letter (so the page can show "Letter given") */
      if (method === "POST" && path === "hod/trainers/letter") {
        const id = clean(body.id, 30), t = trainers[id];
        if (!t) throw new Bad("That trainer is no longer on the list.");
        t.notif = t.notif || {}; t.notif.letter = { ok: true, at: Date.now() };
        await s.setJSON("trainers", trainers);
        await audit(s, { type: "trainer letter printed", trainer: t.name, by: byName, role: byRole });
        return json(view());
      }
      if (method === "DELETE" && path.startsWith("hod/trainers/")) {
        const id = path.split("/")[2];
        if (!trainers[id]) throw new Bad("That trainer is no longer on the list.");
        delete trainers[id];
        for (const r of Object.values(all)) if (r.tid === id) delete r.tid;
        await s.setJSON("trainers", trainers); await s.setJSON("placements", all);
        return json(view());
      }
      if (method === "POST" && path === "hod/assign") {
        const tid = clean(body.tid, 30), ids = Array.isArray(body.ids) ? body.ids.map((x) => clean(x, 200)) : [];
        if (tid && !trainers[tid]) throw new Bad("That trainer is no longer on the list. Refresh and try again.");
        if (!ids.length) throw new Bad("Choose at least one student.");
        let n = 0;
        for (const id of ids) if (all[id]) { if (tid) { all[id].tid = tid; all[id].tby = byRole; } else { delete all[id].tid; delete all[id].tby; } n++; }
        if (!n) throw new Bad("Those students were not found. Refresh and try again.");
        await s.setJSON("placements", all);
        await audit(s, { type: tid ? "trainer assigned: " + trainers[tid].name : "trainer removed from students", count: n, by: byName, role: byRole });
        /* tell the trainer by themselves: the first time always, later only if the last message is older than 15 minutes (the page they get is always the live list, so a burst of assignments sends one message) */
        let notify = null;
        if (tid) {
          const t = trainers[tid];
          if (!t.sentAt || Date.now() - t.sentAt > 15 * 60 * 1000) {
            notify = { id: tid, name: t.name, res: await deliver(req, t, trainerCount(all, tid), null) };
            await s.setJSON("trainers", trainers);
            await audit(s, { type: "trainer message (automatic)", trainer: t.name, result: notify.res, by: byName, role: byRole });
          } else notify = { id: tid, name: t.name, held: true };
        }
        return json({ assigned: n, notify, ...view() });
      }
      return fail("Not found", 404);
    }

    /* ----- attachment start/end dates (entered by the ILO Rep from the trainer's paper feedback) ----- */
    if (path === "attachment/list" || path === "attachment/dates") {
      const c = await staff(req, s); if (!c.role) return fail("Please sign in with an approved portal account.", 401);
      const all = await getJSON(s, "placements", {}), trainers = await getJSON(s, "trainers", {});
      const view = () => ({ list: Object.entries(all).filter(([, r]) => !c.repDept || r.dept === c.repDept).map(([id, r]) => ({ id, n: r.n, a: r.a, cls: r.cls, dept: r.dept, course: r.course, org: r.org, tr: r.tid && trainers[r.tid] ? trainers[r.tid].name : "", sd: r.sd || "", ed: r.ed || "" })).sort((x, y) => (x.cls + x.n).localeCompare(y.cls + y.n)) });
      if (path === "attachment/list") return json(view());
      if (!(c.role === "rep" || c.role === "hod" || c.role === "deputy")) return fail("Not allowed.", 403);
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : []; let n = 0;
      for (const r of rows) {
        const p = all[clean(r.id, 60)]; if (!p || (c.repDept && p.dept !== c.repDept)) continue;
        const sd = pdate(r.sd), ed = pdate(r.ed);
        if (sd && ed && ed < sd) throw new Bad(p.n + ": the end date is before the start date.");
        if (sd) p.sd = sd; else delete p.sd; if (ed) p.ed = ed; else delete p.ed; n++;
      }
      await s.setJSON("placements", all);
      return json({ saved: n, ...view() });
    }

    /* ----- emergency contacts (ILO Rep: own department; HOD, Deputy, Admin: all) ----- */
    if (method === "POST" && path === "emergency/search") {
      const c = await staff(req, s); if (!c.role) return fail("Please sign in with an approved portal account.", 401);
      const q = clean(body.q, 60).toUpperCase(); if (q.replace(/[^A-Z0-9]/g, "").length < 3) throw new Bad("Type at least 3 letters.");
      const accts = Object.values(await getJSON(s, "accounts", {})).filter((a) => a.role === "student" && (!c.repDept || a.dept === c.repDept) && (a.name.includes(q) || a.adm.includes(q)));
      return json({ list: accts.slice(0, 20).map((a) => ({ n: a.name, a: a.adm, cls: a.cls, dept: a.dept, tel: a.phone, nokName: a.nokName || "", nokRel: a.nokRel || "", nokTel: a.nokTel || "", emName: a.emName || "", emTel: a.emTel || "" })) });
    }

    /* ----- dropouts: the ILO Rep requests, the HOD or Deputy approves; approval withdraws the student (login blocked, removed from lists, a copy of the records is kept in the request) ----- */
    if (path.startsWith("dropout/")) {
      const c = await staff(req, s); if (!c.role) return fail("Please sign in with an approved portal account.", 401);
      const list = await getJSON(s, "dropouts", []);
      if (path === "dropout/list") {
        const mine = list.filter((d) => c.isHod || d.dept === c.repDept || d.byId === (c.acct && c.acct.id)).slice(-200).reverse();
        return json({ list: mine.map(({ snap, ...d }) => d), canDecide: c.isHod && !c.isAdmin });
      }
      if (method === "POST" && path === "dropout/request") {
        if (c.role !== "rep") throw new Bad("Only the ILO Representative sends a dropout request.");
        const adm = clean(body.adm, 60).toUpperCase().replace(/\s+/g, ""), reason = clean(body.reason, 300);
        if (adm.length < 4) throw new Bad("Enter the student's admission number.");
        if (reason.length < 5) throw new Bad("Give the reason (for example: left the college, transferred).");
        const accts = await getJSON(s, "accounts", {}), a = Object.values(accts).find((x) => x.role === "student" && x.adm === adm);
        const students = await getJSON(s, "students", {}), reg = await getJSON(s, "register", {});
        const rec = Object.values(students).find((r) => normAdm(r.a) === normAdm(adm)) || Object.values(reg).find((r) => normAdm(r.a) === normAdm(adm));
        if (!a && !rec) throw new Bad("No student with that admission number.");
        if (a && a.dept && a.dept !== c.repDept) throw new Bad("That student is not in your department.");
        if (list.some((d) => d.adm === adm && d.status === "pending")) throw new Bad("A request for this student is already waiting for approval.");
        list.push({ id: "D" + Date.now().toString(36) + randomBytes(2).toString("hex"), adm, name: (a && a.name) || rec.n, cls: (a && a.cls) || (rec && rec.c) || "", dept: c.repDept, reason, byId: c.acct.id, by: c.who, t: Date.now(), status: "pending" });
        await s.setJSON("dropouts", list.slice(-1000));
        await audit(s, { type: "dropout requested " + adm, reason, by: c.who, role: c.role });
        return json({ ok: true });
      }
      if (method === "POST" && path === "dropout/decide") {
        if (!c.isHod || c.isAdmin) throw new Bad("Only the HOD or Deputy HOD can approve or reject.");
        const d = list.find((x) => x.id === clean(body.id, 40));
        if (!d || d.status !== "pending") throw new Bad("This request is no longer waiting.");
        const approve = body.approve === true, note = clean(body.note, 200);
        d.status = approve ? "approved" : "rejected"; d.decidedBy = c.who; d.decidedAt = Date.now(); d.note = note;
        if (approve) {
          const accts = await getJSON(s, "accounts", {}), students = await getJSON(s, "students", {}), reg = await getJSON(s, "register", {});
          d.snap = { students: {}, reg: {} };
          for (const a of Object.values(accts)) if (a.role === "student" && a.adm === d.adm) a.status = "withdrawn";
          for (const [k, r] of Object.entries(students)) if (normAdm(r.a) === normAdm(d.adm)) { d.snap.students[k] = r; delete students[k]; }
          for (const [k, r] of Object.entries(reg)) if (normAdm(r.a) === normAdm(d.adm)) { d.snap.reg[k] = r; delete reg[k]; }
          await s.setJSON("accounts", accts); await s.setJSON("students", students); await s.setJSON("register", reg);
        }
        await s.setJSON("dropouts", list);
        await audit(s, { type: "dropout " + d.status + " " + d.adm, reason: note, by: c.who, role: c.role });
        return json({ ok: true });
      }
    }

    /* ----- reset a student's PIN (so nobody can take over an account by re-registering) ----- */
    if (method === "POST" && path === "auth/reset-pin") {
      const c = await staff(req, s); if (!c.role) return fail("Please sign in with an approved portal account.", 401);
      const adm = clean(body.adm, 60).toUpperCase().replace(/\s+/g, ""), pin = String(body.pin || "");
      if (pin.length < 6 || pin.length > 12 || !/^\d+$/.test(pin)) throw new Bad("Use a 6-12 digit PIN.");
      const all = await getJSON(s, "accounts", {}), a = Object.values(all).find((x) => x.role === "student" && x.adm === adm);
      if (!a || (c.repDept && a.dept !== c.repDept)) throw new Bad("No student with that admission number" + (c.repDept ? " in your department." : "."));
      const salt = randomBytes(16).toString("hex"); a.salt = salt; a.pinHash = pinHash(pin, salt); await s.setJSON("accounts", all);
      await audit(s, { type: "pin-reset", adm, by: c.who, role: c.role });
      return json({ ok: true });
    }

    /* ----- memos: HOD / Deputy / Admin send; ILO Reps reply; replies are read-only once sent ----- */
    /* ----- student attachment feedback and ILO intervention tracking ----- */
    if (path === "feedback" || path.startsWith("feedback/")) {
      const acct = await currentAccount(req, s);
      const staffCtx = acct ? null : await staff(req, s);
      const role = acct ? acct.role : staffCtx.role;
      if (!role) return fail("Please sign in with an approved portal account.", 401);
      const all = await getJSON(s, "feedback", []);
      if (method === "POST" && path === "feedback") {
        if (role !== "student") return fail("Only students can submit attachment feedback.", 403);
        const rating = Number(body.rating), relevance = clean(body.relevance, 30), supervision = clean(body.supervision, 30), safety = clean(body.safety, 30);
        const challenge = clean(body.challenge, 1200), comment = clean(body.comment, 2000), urgent = body.urgent === true;
        if (![1,2,3,4,5].includes(rating)) throw new Bad("Choose an overall rating from 1 to 5.");
        if (!relevance || !supervision || !safety) throw new Bad("Complete the training, supervision and safety questions.");
        if (challenge.length > 1200 || comment.length > 2000) throw new Bad("Your feedback is too long.");
        const placement = (await getJSON(s, "placements", {}))[sid(acct.name, acct.adm)];
        const entry = { id:"F" + Date.now().toString(36) + randomBytes(3).toString("hex"), studentId:acct.id, name:acct.name, adm:acct.adm, dept:acct.dept || "", course:acct.course || "", cls:acct.cls || "", org:placement?.org || "", rating, relevance, supervision, safety, challenge, comment, urgent, status:"new", submittedAt:Date.now(), history:[] };
        all.push(entry); await s.setJSON("feedback", all.slice(-20000));
        await audit(s, { type:"student attachment feedback submitted", adm:acct.adm, by:acct.name, role:"student", urgent });
        return json({ ok:true, id:entry.id });
      }
      if (method === "GET" && path === "feedback") {
        if (role === "student") return json({ list:all.filter(x => x.studentId === acct.id).slice(-100).reverse() });
        const isAdmin = !!(staffCtx && staffCtx.isAdmin), isLeader = isAdmin || ["hod","deputy"].includes(role), dept = isLeader ? "" : (acct.dept || "");
        const list = all.filter(x => !dept || x.dept === dept).slice(-1000).reverse();
        return json({ list, canTriage:true, scope:dept || "All departments" });
      }
      if (method === "POST" && path === "feedback/triage") {
        if (role === "student") return fail("Students cannot change feedback handling status.", 403);
        const isAdmin = !!(staffCtx && staffCtx.isAdmin), isLeader = isAdmin || ["hod","deputy"].includes(role);
        const id = clean(body.id, 60), item = all.find(x => x.id === id);
        if (!item) throw new Bad("Feedback record not found.");
        if (!isLeader && item.dept !== acct.dept) return fail("You can only manage feedback from your department.", 403);
        const status = clean(body.status, 20);
        if (!["new","in_progress","resolved","referred"].includes(status)) throw new Bad("Choose a valid feedback status.");
        const note = clean(body.note, 1000);
        item.status = status; item.history = Array.isArray(item.history) ? item.history : [];
        item.history.push({ status, note, by:staffCtx ? staffCtx.who : acct.name, at:Date.now() });
        await s.setJSON("feedback", all); await audit(s, { type:"feedback status updated", by:staffCtx ? staffCtx.who : acct.name, role, adm:item.adm, status });
        return json({ ok:true });
      }
      return fail("Not found", 404);
    }

    if (path.startsWith("memo")) {
      const c = await staff(req, s); if (!c.role) return fail("Please sign in with an approved portal account.", 401);
      const memos = await getJSON(s, "memos", []), replies = await getJSON(s, "memoreplies", {});
      if (path === "memo/list") {
        const accts = Object.values(await getJSON(s, "accounts", {})).filter((a) => a.role === "rep" && a.status === "approved");
        const expected = [...new Set(accts.map((a) => a.dept))].sort();
        const out = memos.slice().reverse().map((m) => {
          let rs = replies[m.id] || [];
          const tracker = c.isHod ? { responded: expected.filter((d) => rs.some((r) => r.dept === d)).length, total: expected.length, missing: expected.filter((d) => !rs.some((r) => r.dept === d)) } : undefined;
          if (!c.isHod) rs = rs.filter((r) => r.acc === c.acct.id);
          return { ...m, replies: rs.map((r) => ({ id: r.id, name: r.name, dept: r.dept, t: r.t, text: r.text, file: r.file ? r.file.name : "" })), tracker };
        });
        return json({ memos: out, canSend: c.isHod, canReply: c.role === "rep" });
      }
      if (method === "POST" && path === "memo/create") {
        if (!c.isHod) return fail("Only the HOD, Deputy HOD or Admin can send a memo.", 403);
        const title = clean(body.title, 120), text = String(body.text || "").trim().slice(0, 4000);
        if (title.length < 3 || text.length < 3) throw new Bad("Give the memo a title and a message.");
        memos.push({ id: "M" + Date.now().toString(36), title, text, by: c.who, t: Date.now() }); await s.setJSON("memos", memos.slice(-300));
        return json({ ok: true });
      }
      if (method === "POST" && path === "memo/reply") {
        if (c.role !== "rep") return fail("Only an ILO Representative can reply to a memo.", 403);
        const m = memos.find((x) => x.id === clean(body.memoId, 30)); if (!m) throw new Bad("That memo was not found.");
        const text = String(body.text || "").trim().slice(0, 4000); if (text.length < 3) throw new Bad("Type your reply.");
        const rid = "R" + Date.now().toString(36) + randomBytes(2).toString("hex"); let file = null;
        if (body.file && body.file.data) {
          const d = String(body.file.data); if (d.length > 1900000) throw new Bad("The attached file is too big (limit about 1.4 MB).");
          file = { name: clean(body.file.name, 100) || "attachment" }; await s.setJSON("mf-" + rid, { name: file.name, data: d });
        }
        (replies[m.id] = replies[m.id] || []).push({ id: rid, acc: c.acct.id, name: c.acct.name, dept: c.acct.dept, t: Date.now(), text, file });
        await s.setJSON("memoreplies", replies); return json({ ok: true });
      }
      if (path.startsWith("memo/file/")) {
        const rid = clean(path.split("/")[2], 40);
        const r = Object.values(replies).flat().find((x) => x.id === rid);
        if (!r || !(c.isHod || r.acc === c.acct.id)) return fail("Not allowed.", 403);
        return json(await getJSON(s, "mf-" + rid, {}));
      }
      return fail("Not found", 404);
    }

    /* ----- admin login ----- */
    if (method === "POST" && path === "login") {
      if (!samePassword(body.password)) { await new Promise((r) => setTimeout(r, 800)); return fail("Wrong password.", 401); }
      return json({ token: makeToken() });
    }

    /* ----- admin (token required) ----- */
    if (path.startsWith("admin")) {
      const t = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
      if (!validToken(t)) return fail("Please sign in again.", 401);

      if (method === "GET" && path === "admin/accounts") {
        const all=await getJSON(s,"accounts",{});
        return json({list:Object.values(all).map(({pinHash,salt,...a})=>a).sort((x,y)=>(x.status+"|"+x.name).localeCompare(y.status+"|"+y.name))});
      }
      if (method === "POST" && path === "admin/accounts/approve") {
        const all=await getJSON(s,"accounts",{}), id=clean(body.id,100), a=all[id];
        if(!a) throw new Bad("Account not found.");
        a.status="approved"; a.approvedAt=Date.now(); await s.setJSON("accounts",all);
        return json({ok:true});
      }
      if (method === "POST" && path === "admin/accounts/reject") {
        const all=await getJSON(s,"accounts",{}), id=clean(body.id,100), a=all[id];
        if(!a) throw new Bad("Account not found.");
        a.status="rejected"; a.rejectedAt=Date.now(); await s.setJSON("accounts",all);
        return json({ok:true});
      }
      if (method === "POST" && path === "admin/accounts/delete") {
        const all=await getJSON(s,"accounts",{}), id=clean(body.id,100), a=all[id];
        if(!a) throw new Bad("Account not found.");
        if(a.role==="student") throw new Bad("Student accounts are managed in the Student database tab, not here.");
        delete all[id]; await s.setJSON("accounts",all);
        return json({ok:true});
      }
      if (method === "GET" && path === "admin/overview") {
        const accs = Object.values(await getJSON(s, "accounts", {})), reg = await getJSON(s, "register", {}), stu = await getJSON(s, "students", {});
        const pls = await getJSON(s, "placements", {}), mk = await getJSON(s, "marks", {}), trs = await getJSON(s, "trainers", {});
        const sts = accs.filter((x) => x.role === "student"), ilo = accs.filter((x) => x.role !== "student");
        const by = {}; let responded = 0, marks = 0;
        for (const a of sts) {
          const id = sid(a.name, a.adm), d = (a.dept || "Not set"), r = (by[d] = by[d] || { d, students: 0, placed: 0, marked: 0 });
          r.students++; if (pls[id]) { r.placed++; responded++; } if (mk[id]) { r.marked++; marks++; }
        }
        const people = new Set([...Object.keys(reg), ...Object.keys(stu)]);
        const label = (e) => String(e.type || "activity").replace(/-/g, " ") + (e.adm ? " - " + e.adm : "");
        return json({
          registered: sts.length, database: people.size, responded, awaiting: Math.max(0, sts.length - responded), marks,
          ilo: { approved: ilo.filter((x) => x.status === "approved").length, pending: ilo.filter((x) => x.status === "pending").length,
            hod: ilo.filter((x) => x.role === "hod").length, deputy: ilo.filter((x) => x.role === "deputy").length, rep: ilo.filter((x) => x.role === "rep").length },
          covers: Object.keys(stu).length, requests: Object.keys(await getJSON(s, "requests", {})).length,
          trainers: Object.keys(trs).length, unassigned: Object.values(pls).filter((p) => !p.tid).length,
          depts: Object.values(by).sort((x, y) => y.students - x.students),
          recent: (await getJSON(s, "audit", [])).slice(-10).reverse().map((e) => ({ t: e.t, by: e.by || "", text: label(e) })),
        });
      }
      if (method === "GET" && path === "admin/data") {
        const students = await getJSON(s, "students", {});
        return json({
          settings: await getJSON(s, "settings", DEFAULT_SETTINGS),
          courses: await loadCourses(s),
          classcodes: await loadClassCodes(s),
          intakes: intakeNames(),
          departments: DEPTS.concat(OTHER),
          policies: await getJSON(s, "policies", []),
          classpol: await getJSON(s, "classpol", {}),
          hodSet: !!(await getJSON(s, "hodcode", null)),
          nita: await getJSON(s, "nitameta", null),
          stamps: await getJSON(s, "stampmeta", {}),
          nitas: await getJSON(s, "nitasmeta", {}),
          ilo: Object.entries(await getJSON(s, "ilo", {})).map(([id, r]) => ({ id, ...r })).sort((x, y) => (x.t || 0) - (y.t || 0)),
          students: Object.entries(students).map(([id, r]) => ({ id, ...r })),
          requests: Object.entries(await getJSON(s, "requests", {})).map(([id, r]) => ({ id, ...r })).sort((x, y) => (x.t || 0) - (y.t || 0)),
        });
      }
      if (method === "PUT" && path === "admin/settings") {
        const v = cleanSettings(body); await s.setJSON("settings", v); return json({ settings: v });
      }
      if (method === "POST" && path === "admin/hodcode") {
        const code = String(body.code || "").trim();
        if (code.length < 6) throw new Bad("Use an access code of at least 6 characters.");
        await s.setJSON("hodcode", codeHash(code));
        return json({ hodSet: true });
      }
      if (method === "DELETE" && path.startsWith("admin/placements/")) {
        const all = await getJSON(s, "placements", {}); delete all[path.split("/")[2]]; await s.setJSON("placements", all);
        return json({ total: Object.keys(all).length });
      }
      if (method === "GET" && path === "admin/register") {
        const reg = await getJSON(s, "register", {}), students = await getJSON(s, "students", {});
        const list = Object.entries(reg).map(([id, r]) => ({ id, ...r, cover: !!students[id] })).sort((x, y) => (x.c + x.n).localeCompare(y.c + y.n));
        return json({ list });
      }
      if (method === "DELETE" && path.startsWith("admin/register/")) {
        const reg = await getJSON(s, "register", {}); delete reg[path.split("/")[2]]; await s.setJSON("register", reg);
        return json({ total: Object.keys(reg).length });
      }
      if (method === "PUT" && path === "admin/policies") {
        const v = cleanPolicies(body.policies); await s.setJSON("policies", v);
        const rules = await getJSON(s, "classpol", {});
        for (const c of Object.keys(rules)) if (!v.some((x) => x.id === rules[c])) delete rules[c];
        await s.setJSON("classpol", rules);
        return json({ policies: v, classpol: rules });
      }
      if (method === "POST" && path === "admin/assign") {
        const policies = await getJSON(s, "policies", []), pid = clean(body.pid, 30);
        if (pid && !policies.some((x) => x.id === pid)) throw new Bad("That policy no longer exists. Refresh and try again.");
        const cur = await getJSON(s, "students", {});
        const cls = clean(body.c, 40), ids = Array.isArray(body.ids) ? body.ids.map((x) => clean(x, 200)) : [];
        if (!cls && !ids.length) throw new Bad("Choose a class or some students.");
        let assigned = 0;
        for (const [id, r] of Object.entries(cur)) {
          if (!(cls ? r.c === cls : ids.includes(id))) continue;
          cur[id] = { n: r.n, a: r.a, c: r.c, ...(pid && { pid }) };
          assigned++;
        }
        if (!assigned) throw new Bad("No students matched.");
        await s.setJSON("students", cur);
        const rules = await getJSON(s, "classpol", {});
        if (cls) { if (pid) rules[cls] = pid; else delete rules[cls]; await s.setJSON("classpol", rules); }
        return json({ assigned, classpol: rules, students: Object.entries(cur).map(([id, r]) => ({ id, ...r })) });
      }
      if (method === "POST" && path === "admin/ilo/approve") {
        const all = await getJSON(s, "ilo", {}), sub = all[clean(body.id, 40)];
        if (!sub) throw new Bad("That submission is no longer in the list. Refresh and try again.");
        if (sub.kind === "policy") {
          const settings = await getJSON(s, "settings", DEFAULT_SETTINGS), policies = await getJSON(s, "policies", []);
          const cur = await getJSON(s, "students", {}), rules = await getJSON(s, "classpol", {});
          let pid = sub.pid || "";
          const np = sub.newPolicy;
          if (np) {
            const same = (x, y) => x.policyNumber === y.policyNumber && x.policyStart === y.policyStart && x.policyEnd === y.policyEnd && x.issueDate === y.issueDate;
            if (same(np, settings)) pid = "";
            else {
              let m = policies.find((x) => same(x, np));
              if (!m) {
                let name = np.policyNumber, k = 2;
                while (policies.some((x) => x.name.toLowerCase() === name.toLowerCase())) name = np.policyNumber + " (" + k++ + ")";
                m = { id: "P" + Date.now().toString(36) + "n", name, ...np }; policies.push(m);
              }
              pid = m.id;
            }
          } else if (pid && !policies.some((x) => x.id === pid)) throw new Bad("The policy chosen in this submission has since been removed. Reject it and ask the representative to send it again.");
          let assigned = 0;
          for (const [id, r] of Object.entries(cur)) if (r.c === sub.cls) { cur[id] = { n: r.n, a: r.a, c: r.c, ...(pid && { pid }) }; assigned++; }
          if (pid) rules[sub.cls] = pid; else delete rules[sub.cls];
          delete all[clean(body.id, 40)];
          await s.setJSON("policies", policies); await s.setJSON("students", cur); await s.setJSON("classpol", rules); await s.setJSON("ilo", all);
          return json({ assigned, policies, classpol: rules, students: Object.entries(cur).map(([id, r]) => ({ id, ...r })), ilo: Object.entries(all).map(([id, r]) => ({ id, ...r })) });
        }
        const courses = await loadCourses(s);
        let c = sub.key ? courses.find((x) => x.key === sub.key) : courses.find((x) => normT(x.title) === normT(sub.title));
        if (c) { c.percent = sub.percent; c.units = sub.units; }
        else courses.push({ key: "C" + Date.now().toString(36), title: sub.title, dept: sub.dept, percent: sub.percent, units: sub.units });
        delete all[clean(body.id, 40)];
        await s.setJSON("courses", courses); await s.setJSON("ilo", all);
        return json({ courses, ilo: Object.entries(all).map(([id, r]) => ({ id, ...r })) });
      }
      if (method === "DELETE" && path.startsWith("admin/ilo/")) {
        const all = await getJSON(s, "ilo", {}); delete all[path.split("/")[2]]; await s.setJSON("ilo", all);
        return json({ total: Object.keys(all).length });
      }
      if (method === "POST" && path === "admin/stamps") {
        const k = clean(body.key, 10), data = String(body.data || ""), meta = await getJSON(s, "stampmeta", {});
        if (!/^(oct|feb|jun)\d{4}$/.test(k)) throw new Bad("Choose the stamp month and year.");
        if (body.remove === true) { await s.setJSON("stamp_" + k, {}); delete meta[k]; await s.setJSON("stampmeta", meta); return json({ stamps: meta }); }
        const name = clean(body.name, 100), type = /\.jpe?g$/i.test(name) ? "image/jpeg" : /\.png$/i.test(name) ? "image/png" : "";
        if (!type) throw new Bad("Upload the stamp as a PNG or JPG image.");
        if (!data || data.length > 2800000) throw new Bad("The image is empty or too large. Keep it under 2 MB.");
        await s.setJSON("stamp_" + k, { data, type }); meta[k] = { name, t: Date.now() }; await s.setJSON("stampmeta", meta);
        return json({ stamps: meta });
      }
      if (method === "POST" && path === "admin/nitas") {
        const k = clean(body.key, 10), meta = await getJSON(s, "nitasmeta", {});
        if (!/^(oct|feb|jun)\d{4}$/.test(k)) throw new Bad("Choose the stamp month and year.");
        if (body.remove === true) { await s.setJSON("nitaf_" + k, {}); delete meta[k]; await s.setJSON("nitasmeta", meta); return json({ nitas: meta }); }
        const name = clean(body.name, 100), data = String(body.data || "");
        if (!/\.(pdf|docx?|jpe?g|png)$/i.test(name)) throw new Bad("Upload the NITA form as a PDF, Word document or image.");
        if (!data || data.length > 5500000) throw new Bad("The file is empty or too large. Keep it under 4 MB.");
        await s.setJSON("nitaf_" + k, { data }); meta[k] = { name, type: clean(body.type, 80) || "application/octet-stream", t: Date.now() }; await s.setJSON("nitasmeta", meta);
        return json({ nitas: meta });
      }
      if (method === "POST" && path === "admin/nita") {
        const name = clean(body.name, 100), data = String(body.data || "");
        if (!/\.(pdf|docx?|jpe?g|png)$/i.test(name)) throw new Bad("Upload the NITA form as a PDF, Word document or image.");
        if (!data || data.length > 5500000) throw new Bad("The file is empty or too large. Keep it under 4 MB.");
        const meta = { name, type: clean(body.type, 80) || "application/octet-stream", t: Date.now() };
        await s.setJSON("nitafile", { data }); await s.setJSON("nitameta", meta);
        return json({ nita: meta });
      }
      if (method === "DELETE" && path === "admin/nita") {
        await s.setJSON("nitafile", {}); await s.setJSON("nitameta", null);
        return json({ nita: null });
      }
      if (method === "GET" && path === "admin/classcodes") {
        return json({ list: await loadClassCodes(s), intakes: intakeNames() });
      }
      if (method === "PUT" && path === "admin/classcodes") {
        const v = cleanClassCodes(body.list, await loadCourses(s));
        await s.setJSON("classcodes", v);
        const moved = await applyClassCodes(s);
        return json({ list: v, moved });
      }
      if (method === "PUT" && path === "admin/courses") {
        const v = cleanCourses(body.courses); await s.setJSON("courses", v); await s.setJSON("seeded", true); return json({ courses: v });
      }
      if (method === "POST" && path === "admin/students") {
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const cur = body.mode === "replace" ? {} : await getJSON(s, "students", {});
        const settings = await getJSON(s, "settings", DEFAULT_SETTINGS);
        const policies = await getJSON(s, "policies", []), rules = await getJSON(s, "classpol", {});
        let added = 0, updated = 0, skipped = 0, unknownPolicy = 0;
        for (const r of rows) {
          const n = clean(r.n, 120).toUpperCase(), a = clean(r.a, 60).toUpperCase().replace(/\s+/g, ""), c = clean(r.c, 40);
          if (n.length < 3 || a.length < 4) { skipped++; continue; }
          const id = sid(n, a);
          let ov;
          try { ov = policyOverrides(r, settings); } catch { skipped++; continue; }
          const keep = cur[id] || {};
          let pid = keep.pid || (cur[id] || Object.keys(ov).length ? "" : (rules[c] && policies.some((x) => x.id === rules[c]) ? rules[c] : ""));
          const pname = clean(r.pol, 60).toLowerCase();
          if (pname && !/^(default|none)$/.test(pname)) {
            const m = policies.find((x) => x.name.toLowerCase() === pname);
            if (!m) { skipped++; unknownPolicy++; continue; }
            pid = m.id;
          } else if (/^(default|none)$/.test(pname)) pid = "";
          cur[id] ? updated++ : added++;
          const keepOv = { ...(keep.p && { p: keep.p }), ...(keep.i && { i: keep.i }), ...(keep.s && { s: keep.s }), ...(keep.e && { e: keep.e }) };
          cur[id] = { n, a, c, ...(pid && { pid }), ...(Object.keys(ov).length ? ov : keepOv) };
        }
        await s.setJSON("students", cur);
        /* requests that now have a cover on file are done */
        const reqs = await getJSON(s, "requests", {});
        let cleared = 0;
        for (const id of Object.keys(reqs)) if (cur[id]) { delete reqs[id]; cleared++; }
        if (cleared) await s.setJSON("requests", reqs);
        return json({ added, updated, skipped, unknownPolicy, cleared, total: Object.keys(cur).length });
      }
      if (method === "POST" && path === "admin/approve") {
        const settings = await getJSON(s, "settings", DEFAULT_SETTINGS);
        const reqs = await getJSON(s, "requests", {});
        const cur = await getJSON(s, "students", {});
        const ids = body.all ? Object.keys(reqs) : [clean(body.id, 200)];
        let approved = 0;
        const policies = await getJSON(s, "policies", []), rules = await getJSON(s, "classpol", {});
        const explicit = body.pid !== undefined && body.pid !== "auto", pidIn = clean(body.pid === "auto" ? "" : body.pid, 30);
        if (pidIn && !policies.some((x) => x.id === pidIn)) throw new Bad("That policy no longer exists. Refresh and try again.");
        const ov = body.all || explicit ? {} : policyOverrides(body, settings);
        for (const id of ids) {
          const r = reqs[id]; if (!r) continue;
          const pid = explicit ? pidIn : (Object.keys(ov).length ? "" : (rules[r.c] && policies.some((x) => x.id === rules[r.c]) ? rules[r.c] : ""));
          cur[id] = { n: r.n, a: r.a, c: r.c, ...(pid && { pid }), ...ov };
          delete reqs[id]; approved++;
        }
        if (!approved) throw new Bad("That request is no longer in the list. Refresh and try again.");
        await s.setJSON("students", cur); await s.setJSON("requests", reqs);
        return json({ approved, total: Object.keys(cur).length, requests: Object.keys(reqs).length });
      }
      if (method === "PUT" && path.startsWith("admin/students/")) {
        const id = path.split("/")[2];
        const settings = await getJSON(s, "settings", DEFAULT_SETTINGS);
        const cur = await getJSON(s, "students", {});
        if (!cur[id]) throw new Bad("Student not found. Refresh and try again.");
        const policies = await getJSON(s, "policies", []), pid = clean(body.pid, 30);
        if (pid && !policies.some((x) => x.id === pid)) throw new Bad("That policy no longer exists. Refresh and try again.");
        const ov = pid ? {} : policyOverrides(body, settings);
        cur[id] = { n: cur[id].n, a: cur[id].a, c: cur[id].c, ...(pid && { pid }), ...ov };
        await s.setJSON("students", cur);
        return json({ student: { id, ...cur[id] } });
      }
      if (method === "DELETE" && (path === "admin/requests" || path.startsWith("admin/requests/"))) {
        const id = path.split("/")[2];
        const reqs = id ? await getJSON(s, "requests", {}) : {};
        if (id) delete reqs[id];
        await s.setJSON("requests", reqs);
        return json({ total: Object.keys(reqs).length });
      }
      if (method === "DELETE" && path.startsWith("admin/students/")) {
        const id = path.split("/")[2];
        const cur = await getJSON(s, "students", {});
        delete cur[id];
        await s.setJSON("students", cur);
        return json({ total: Object.keys(cur).length });
      }
    }
    return fail("Not found", 404);
  } catch (e) {
    return e instanceof Bad ? fail(e.message, 400) : fail("Server error. " + (e.message || ""), 500);
  }
};
