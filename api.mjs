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
const digits = (v) => String(v || "").replace(/[^\d+]/g, "").slice(0, 16);

/* ---------- validation ---------- */
/* departments and courses, from the RVNP 2026-2027 brochure (units are added later by the ILO representatives) */
const OTHER = "Other courses";
const CATALOG = {
  "Agriculture and Environmental Studies": [["General Agriculture & Extension",[5,6]],["Agripreneurship Technology",[6]],["Horticulture Farm Technology",[5,6]],["Environmental Technology",[5,6]],["Aquaculture",[6]],["Animal Production",[5,6]],["Animal Health and Production",[5,6]],["General Agriculture",[4]],["Livestock Food Production",[5]],["Sheep Shearing",[3]]],
  "Agricultural and Mechanical Engineering": [["Agricultural Engineering",[6]],["Agriculture Machinery & Equipment",[4]],["Automotive Engineering",[6]],["Automotive Technology",[5,6]],["Welding & Fabrication",[4,5]],["Mechanical Production Technology",[5,6]]],
  "Building and Civil Engineering": [["Masonry",[4]],["Building Technology",[5,6]],["Carpentry & Joinery",[4,5]],["Land Surveying",[5,6]],["Architectural Draftsman",[5]],["Architecture",[6]],["Civil Engineering",[6]],["Quantity Surveying",[6]],["Water Engineering Technology",[6]],["Plumbing",[4,5]],["Road Construction",[5]]],
  "Business Studies": [["Accountancy plus Quickbooks",[6]],["Banking & Finance plus Quickbooks",[6]],["Business Mgt with ICT",[5,6]],["Cooperative Mgt with ICT",[5,6]],["Human Resource Mgt with ICT",[5,6]],["Office Administration (Secretarial) with ICT",[5,6]],["Supply Chain Mgt with ICT",[5,6]],["Store Keeping Mgt with ICT",[5]],["Road Transport Mgt with ICT",[5,6]],["Project Mgt with ICT",[5,6]],["Investment Mgt with ICT",[6]],["Procurement with ICT",[5]]],
  "Electrical and Electronics Engineering": [["Electrical Installation Technology",[4]],["Solar PV System Installation Technology",[4]],["Electrical Engineering Technology",[5,6]],["Telecommunication Engineering Technology",[6]],["Instrumentation & Control Technology",[5,6]]],
  "Health and Applied Sciences": [["Science Laboratory",[5,6]],["Applied Biology",[6]],["Medical Engineering",[6]],["Food Technology",[5,6]],["Petroleum & Geoscience",[5,6]],["Health Records & IT",[5,6]],["Community Health",[5,6]],["Analytical Chemistry",[6]],["Nutrition & Dietetics",[5,6]],["Geophysical Exploration Technology",[5,6]],["Medical Lab",[6]],["Geology Technology",[6]]],
  "Hospitality and Tourism": [["Baking Technology",[5,6]],["Fashion Design",[4,5]],["Fashion Design Mgt",[6]],["Food & Beverage Production (Culinary Arts)",[4,5]],["Food & Beverage Management",[6]],["Hair Dressing",[4,5]],["Beauty Therapy",[4,5]],["Tourism & Travel Mgt",[6]],["Tour Guide Operations",[4,5]],["Catering & Accommodation Operations",[5]],["Catering & Accommodation Mgt",[6]],["Cosmetology",[4,5,6]]],
  "Information Communication Technology": [["Library & Information Service",[5]],["Library & Information Management",[6]],["Computer Science",[6]],["ICT Technician",[5,6]],["Software Developer",[5,6]],["Network System Administrator",[5]],["Network System Technician",[6]]],
  "Liberal Studies": [["Counselling Psychology",[5,6]],["Social Work & Community Development",[5,6]],["Criminal Justice Mgt",[5,6]],["Kenya Sign Language",[4]],["Child Care & Protection",[5,6]]],
};
const DEPTS = Object.keys(CATALOG), ELEC = "Electrical and Electronics Engineering";
const normT = (t) => String(t).toUpperCase().replace(/[^A-Z0-9]/g, "");
function catalogList() {
  const out = []; let d = 0;
  for (const [dept, items] of Object.entries(CATALOG)) {
    d++; let n = 0;
    for (const [name, levels] of items) for (const l of levels) { n++; out.push({ key: "D" + d + "-" + n, dept, title: name.toUpperCase().replace(/\s+/g, " ") + " LEVEL " + l, percent: 0, units: [] }); }
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
  return c || DEFAULT_COURSES;
}
function deptList(courses) { return courses.some((c) => c.dept === OTHER) ? [...DEPTS, OTHER] : DEPTS; }
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
      return json({ departments: DEPTS.concat(OTHER) });
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
      if(role==="rep" && !DEPTS.includes(dept) && dept!==OTHER) throw new Bad("Choose your department.");
      if(pin.length<4 || pin.length>12 || !/^\d+$/.test(pin)) throw new Bad("Use a 4-12 digit PIN.");
      const all=await getJSON(s,"accounts",{});
      if(Object.values(all).some(a=>a.idno===idno || a.pf===pf)) throw new Bad("An account with that ID or PF number already exists.");
      const id="A"+Date.now().toString(36)+randomBytes(3).toString("hex");
      const salt=randomBytes(16).toString("hex");
      all[id]={id,role,name,idno,phone,pf,dept:role==="rep"?dept:"",salt,pinHash:pinHash(pin,salt),status:"pending",createdAt:Date.now()};
      await s.setJSON("accounts",all);
      return json({ok:true,status:"pending",message:"Registration submitted. The administrator must approve your account before you can log in."});
    }
    if (method === "POST" && path === "auth/register-student") {
      const name=clean(body.name,120).toUpperCase(), adm=clean(body.adm,60).toUpperCase().replace(/\s+/g,"");
      const cls=clean(body.cls,40).toUpperCase(), dept=clean(body.dept,80), phone=digits(body.phone), pin=String(body.pin||"");
      if(name.length<3) throw new Bad("Enter your full name.");
      if(!/^[A-Z0-9]{2,6}\/(\d{2}[A-Z]?\/)?\d{4,6}$/.test(adm)) throw new Bad("Enter your admission number as printed on your ID, with the slashes, e.g. EPL6/24S/404930");
      if(cls.length<2) throw new Bad("Enter your class.");
      if(!DEPTS.includes(dept) && dept !== OTHER) throw new Bad("Choose your department.");
      if(phone.replace(/\D/g,"").length<9) throw new Bad("Enter a valid phone number.");
      if(pin.length<4 || pin.length>12 || !/^\d+$/.test(pin)) throw new Bad("Use a 4-12 digit PIN.");
      const all=await getJSON(s,"accounts",{});
      const old=Object.values(all).find(a=>a.role==="student" && a.adm===adm);
      const id=old?old.id:"S"+Date.now().toString(36)+randomBytes(3).toString("hex");
      const salt=randomBytes(16).toString("hex");
      all[id]={id,role:"student",name,adm,cls,dept,phone,salt,pinHash:pinHash(pin,salt),status:"approved",createdAt:old?.createdAt||Date.now(),updatedAt:Date.now()};
      await s.setJSON("accounts",all);
      const reg=await getJSON(s,"register",{});
      const rid=sid(name,adm);
      reg[rid]={id:rid,n:name,a:adm,c:cls,tel:phone,accountId:id,t:Date.now()};
      await s.setJSON("register",reg);
      return json({ok:true,updated:!!old});
    }
    if (method === "POST" && path === "auth/login") {
      const role=clean(body.role,20).toLowerCase(), identifier=clean(body.identifier,80).toUpperCase().replace(/\s+/g,""), pin=String(body.pin||"");
      const all=await getJSON(s,"accounts",{});
      const a=Object.values(all).find(x=>
        role==="staff"
          ? x.role!=="student" && (x.idno===identifier || x.pf===identifier)
          : x.role===role && ((role==="student"&&x.adm===identifier) || role!=="student"&&(x.idno===identifier||x.pf===identifier))
      );
      if(!a || !a.salt || pinHash(pin,a.salt)!==a.pinHash) { await new Promise(r=>setTimeout(r,500)); return fail("Wrong login details.",401); }
      if(a.status!=="approved") return fail(a.status==="pending"?"Your account is waiting for administrator approval.":"Your account is not active.",403);
      return json({token:makeAccountToken(a),role:a.role,name:a.name,dept:a.dept||"",id:a.id});
    }

    /* ----- public ----- */
    if (method === "GET" && path === "me") {
      const acct = await currentAccount(req,s); if(!acct) return fail("Please sign in again.",401);
      return json({ id:acct.id, role:acct.role, name:acct.name, adm:acct.adm||"", cls:acct.cls||"", dept:acct.dept||"", phone:acct.phone||"" });
    }
    if (method === "GET" && path === "courses") {
      const courses = await loadCourses(s);
      return json({ courses, departments: deptList(courses), nita: await getJSON(s, "nitameta", null) });
    }
    if (method === "GET" && path === "nita") {
      const f = await getJSON(s, "nitafile", null), m = await getJSON(s, "nitameta", null);
      if (!f || !m) return fail("The NITA form has not been uploaded yet.", 404);
      return new Response(Buffer.from(f.data, "base64"), { headers: { "Content-Type": m.type || "application/octet-stream", "Content-Disposition": 'attachment; filename="' + m.name.replace(/[^A-Za-z0-9._ -]/g, "_") + '"', "Cache-Control": "no-store" } });
    }
    if (method === "POST" && path === "placement") {
      const acct = await currentAccount(req,s); if(!requireRole(acct,["student"])) return fail("Please sign in as a student.",401);
      const n = acct.name, a = acct.adm, cls = acct.cls, dept = acct.dept, tel1 = acct.phone,
        course = clean(body.course, 120).toUpperCase(), org = clean(body.org, 120),
        loc = clean(body.loc, 200), sup = clean(body.sup, 100), town = clean(body.town, 60),
        tel2 = digits(body.tel2);
      if (n.length < 3) throw new Bad("Enter your full name.");
      if (a.length < 6) throw new Bad("Your account is missing a valid admission number.");
      if (cls.length < 2) throw new Bad("Your account is missing a class. Please update your student account.");
      if (!DEPTS.includes(dept) && dept !== OTHER) throw new Bad("Your account is missing a valid department. Please update your student account.");
      if (course.length < 3) throw new Bad("Select your course.");
      if (org.length < 2) throw new Bad("Enter the name of the organization.");
      if (loc.length < 5) throw new Bad("Describe where the organization is, e.g. \"near Naivas, Njoro Road\".");
      if (sup.length < 3) throw new Bad("Enter your supervisor's name.");
      if (town.length < 2) throw new Bad("Enter the town.");
      if (tel1.replace(/\D/g, "").length < 9) throw new Bad("Enter phone number 1 (at least 9 digits).");
      if (tel2 && tel2.replace(/\D/g, "").length < 9) throw new Bad("Phone number 2 must have at least 9 digits, or leave it empty.");
      const all = await getJSON(s, "placements", {}), id = sid(n, a), old = all[id];
      if (!old && Object.keys(all).length >= 20000) throw new Bad("The list is full. Please contact the Industrial Liaison Office.");
      all[id] = { n, a, cls, dept, course, org, loc, sup, town: town.toUpperCase(), tel1, tel2, t: old ? old.t : Date.now(), u: Date.now(), ...(old && old.tid && { tid: old.tid }) };
      await s.setJSON("placements", all);
      return json({ ok: true, updated: !!old });
    }
    if (method === "GET" && path === "placement-me") {
      const acct = await currentAccount(req,s); if(!requireRole(acct,["student"])) return fail("Please sign in as a student.",401);
      const all = await getJSON(s,"placements",{}), trainers = await getJSON(s,"trainers",{}), r = all[sid(acct.name,acct.adm)];
      const t = r && r.tid ? trainers[r.tid] : null;
      return json({ hasPlacement:!!r, placement:r?{org:r.org,town:r.town,loc:r.loc,sup:r.sup,course:r.course}:null, trainer:t?{name:t.name,tel:t.tel}:null });
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
      if(pin && (pin.length<4 || pin.length>12 || !/^\d+$/.test(pin))) throw new Bad("Use a 4-12 digit PIN.");
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
      const placements = await getJSON(s, "placements", {}), marks = await getJSON(s, "marks", {});
      const cdept = await getJSON(s, "classdept", {});
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
          const g = byClass[c] || (byClass[c] = { c, dept: d, students: [] });
          const m = marks[p.id];
          g.students.push({ n: p.n, a: p.a, m: m ? m.m : null, o: m ? m.o : null, pct: m ? Math.round((m.m / m.o) * 1000) / 10 : null });
        }
        const classes = Object.values(byClass).sort((x, y) => (x.dept + "|" + x.c).localeCompare(y.dept + "|" + y.c));
        for (const g of classes) g.students.sort((x, y) => x.n.localeCompare(y.n));
        return { classes, departments: repDept ? [repDept] : DEPTS.concat(OTHER, "Not yet assigned"), role: repDept ? "rep" : isAdmin ? "admin" : "hod", codes: isAdmin ? Object.keys(codes) : undefined };
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
        /* a representative can only change marks of students in their own department's classes */
        const byAdm = new Map(); let other = 0; const otherList = [];
        for (const p of people.values()) {
          if (repDept && (!p.c || deptOf(p.c) !== repDept)) { byAdm.set(normAdm(p.a), null); continue; }
          byAdm.set(normAdm(p.a), p.id);
        }
        let saved = 0, cleared = 0; const unmatched = [], invalid = [];
        for (const r of rows) {
          const a = clean(r.a, 60); if (!a) continue;
          const k = normAdm(a), id = byAdm.get(k);
          if (id === null) { other++; if (otherList.length < 50) otherList.push(a); continue; }
          if (!id) { unmatched.push(a); continue; }
          const raw = String(r.m ?? "").trim();
          if (raw === "") { if (r.clear === true && marks[id]) { delete marks[id]; cleared++; } continue; }
          const m = Number(String(raw).replace("%", ""));
          if (!(m >= 0) || m > 100 || isNaN(m)) { invalid.push(a); continue; }
          marks[id] = { m, o: 100, u: Date.now(), by: acct.id }; saved++;
        }
        await s.setJSON("marks", marks);
        return json({ saved, cleared, unmatched: unmatched.slice(0, 50), unmatchedCount: unmatched.length, invalid: invalid.slice(0, 50), invalidCount: invalid.length, otherDept: otherList, otherDeptCount: other, ...build() });
      }
      if (!isHod) return fail("Not allowed.", 403);
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

    /* ----- ILO HOD / deputy HOD (access code) ----- */
    if (path === "hod" || path.startsWith("hod/")) {
      const acct=await currentAccount(req,s), admTok=(req.headers.get("authorization")||"").replace(/^Bearer /,""); if (!(admTok && validToken(admTok)) && !requireRole(acct,["hod","deputy"])) { await new Promise((r) => setTimeout(r, 800)); return fail("Please sign in as an approved HOD or Deputy HOD.", 401); }
      const all = await getJSON(s, "placements", {}), trainers = await getJSON(s, "trainers", {});
      const view = () => {
        const cnt = {};
        for (const r of Object.values(all)) if (r.tid && trainers[r.tid]) cnt[r.tid] = (cnt[r.tid] || 0) + 1;
        return {
          placements: Object.entries(all).map(([id, r]) => ({ id, ...r, tid: r.tid && trainers[r.tid] ? r.tid : "" }))
            .sort((x, y) => (x.dept + x.course + x.n).localeCompare(y.dept + y.course + y.n)),
          trainers: Object.entries(trainers).map(([id, t]) => ({ id, ...t, count: cnt[id] || 0 })).sort((x, y) => x.name.localeCompare(y.name)),
          departments: DEPTS.concat(OTHER),
        };
      };
      if (method === "GET" && path === "hod/data") return json(view());
      if (method === "POST" && path === "hod/trainers") {
        const name = clean(body.name, 80), tel = digits(body.tel);
        if (name.length < 3) throw new Bad("Enter the trainer's name.");
        if (tel.replace(/\D/g, "").length < 9) throw new Bad("Enter the trainer's phone number (at least 9 digits).");
        if (Object.values(trainers).some((t) => t.name.toLowerCase() === name.toLowerCase())) throw new Bad("A trainer called \"" + name + "\" is already on the list.");
        if (Object.keys(trainers).length >= 300) throw new Bad("Too many trainers.");
        trainers["T" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4)] = { name, tel };
        await s.setJSON("trainers", trainers);
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
        for (const id of ids) if (all[id]) { if (tid) all[id].tid = tid; else delete all[id].tid; n++; }
        if (!n) throw new Bad("Those students were not found. Refresh and try again.");
        await s.setJSON("placements", all);
        return json({ assigned: n, ...view() });
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
      if (method === "GET" && path === "admin/data") {
        const students = await getJSON(s, "students", {});
        return json({
          settings: await getJSON(s, "settings", DEFAULT_SETTINGS),
          courses: await loadCourses(s),
          departments: DEPTS.concat(OTHER),
          policies: await getJSON(s, "policies", []),
          classpol: await getJSON(s, "classpol", {}),
          hodSet: !!(await getJSON(s, "hodcode", null)),
          nita: await getJSON(s, "nitameta", null),
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
