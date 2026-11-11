// =====================================================
// Tablewise: Restaurant Reservation & Waitlist System
// =====================================================

// ---------- 1. Settings and saved data ----------
const TABLES = [
  { id: 1, seats: 2 }, { id: 2, seats: 2 }, { id: 3, seats: 4 }, { id: 4, seats: 4 },
  { id: 5, seats: 4 }, { id: 6, seats: 6 }, { id: 7, seats: 6 }, { id: 8, seats: 8 }
];
const SLOTS = ["12:00", "13:00", "14:00", "19:00", "20:00", "21:00"];
const MINUTES_PER_PARTY = 45;   // typical dining time, used for the wait estimate
const $ = id => document.getElementById(id);

let bookings = load("bookings");
let waitlist = load("waitlist");
let activity = load("activity");   // notification history
let editingId = null;              // id of the booking being edited, or null

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
}
function save() {
  localStorage.setItem("bookings", JSON.stringify(bookings));
  localStorage.setItem("waitlist", JSON.stringify(waitlist));
  localStorage.setItem("activity", JSON.stringify(activity));
}

// ---------- 2. Small helpers ----------
function today() { return new Date().toLocaleDateString("en-CA"); }   // YYYY-MM-DD
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML.replace(/"/g, "&quot;");
}
function showMsg(text, type) { $("msg").textContent = text; $("msg").className = type; }
function showToast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 3500);
}
// Add a line to the activity (notification) history, newest first
function log(text) {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  activity.unshift({ text, time });
  activity = activity.slice(0, 15);
}

// ---------- 3. Core logic ----------
// Table ids already booked for a date + time (ignoreId lets an edited booking keep its own table)
function takenIds(date, slot, ignoreId) {
  return bookings.filter(b => b.date === date && b.slot === slot && b.id !== ignoreId).map(b => b.table);
}
// Smallest free table that fits the party (best use of seats)
function findTable(date, slot, party, ignoreId) {
  const taken = takenIds(date, slot, ignoreId);
  return TABLES.filter(t => !taken.includes(t.id) && t.seats >= party)
               .sort((a, b) => a.seats - b.seats)[0];
}
// Give free tables to the waitlist, first come first served
function promoteWaitlist() {
  const promoted = [];
  waitlist = waitlist.filter(w => {
    const t = findTable(w.date, w.slot, w.party);
    if (!t) return true;                         // still waiting
    bookings.push({ ...w, table: t.id });        // move to bookings
    log(`${w.name} moved from the waitlist to Table ${t.id} (${w.date}, ${w.slot}).`);
    promoted.push(w.name);
    return false;
  });
  return promoted;
}
function waitlistPosition(entry) {
  return waitlist.filter(w => w.date === entry.date && w.slot === entry.slot).indexOf(entry) + 1;
}
function validate(d) {
  if (d.name.length < 2) return "Enter your name.";
  if (!/^\d{10}$/.test(d.phone)) return "Phone number must be 10 digits.";
  if (!d.date || d.date < today()) return "Pick today or a future date.";
  if (!(d.party >= 1 && d.party <= 8)) return "We seat 1 to 8 guests.";
  const duplicate = [...bookings, ...waitlist].some(x =>
    x.id !== editingId && x.phone === d.phone && x.date === d.date && x.slot === d.slot);
  return duplicate ? "This phone number already has a request for that time." : "";
}

// ---------- 4. Create, edit, cancel ----------
function createBooking(d) {
  const entry = { id: Date.now(), ...d };
  const table = findTable(d.date, d.slot, d.party);

  if (table) {
    entry.table = table.id;
    bookings.push(entry);
    showMsg(`Confirmed: Table ${table.id} for ${d.party} on ${d.date} at ${d.slot}.`, "ok");
    log(`${d.name} booked Table ${table.id} (${d.date}, ${d.slot}).`);
    showSlip(entry);
  } else {
    waitlist.push(entry);
    const pos = waitlistPosition(entry);
    showMsg(`Fully booked. You are number ${pos} on the waitlist. Estimated wait: about ${pos * MINUTES_PER_PARTY} minutes if a table frees up.`, "warn");
    log(`${d.name} joined the waitlist at position ${pos} (${d.date}, ${d.slot}).`);
    $("slip").hidden = true;
  }
  ["name", "phone", "notes"].forEach(f => $(f).value = "");
}

function updateBooking(d) {
  const b = bookings.find(x => x.id === editingId);
  const table = findTable(d.date, d.slot, d.party, editingId);
  if (!table) return showMsg("No table is free for that change, so your booking stays as it was.", "err");

  Object.assign(b, d, { table: table.id });
  log(`${b.name} changed their booking to Table ${table.id} (${b.date}, ${b.slot}).`);
  announce(promoteWaitlist());          // the old table may now be free for someone waiting
  showMsg(`Booking updated: Table ${table.id} for ${b.party} on ${b.date} at ${b.slot}.`, "ok");
  showSlip(b);
  stopEdit();
}

function cancelBooking(id) {
  const b = bookings.find(x => x.id === id);
  bookings = bookings.filter(x => x.id !== id);
  log(`${b.name} cancelled Table ${b.table} (${b.date}, ${b.slot}).`);
  const promoted = promoteWaitlist();
  announce(promoted);
  showMsg(promoted.length ? `Cancelled. ${promoted.join(", ")} moved from the waitlist to a table.` : "Booking cancelled.", "ok");
}

function announce(promoted) {
  if (promoted.length) showToast(`${promoted.join(", ")} got a table from the waitlist.`);
}

function startEdit(id) {
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  editingId = id;
  ["name", "phone", "date", "slot", "party", "notes"].forEach(f => $(f).value = b[f] || "");
  $("submitBtn").textContent = "Save changes";
  $("editNote").hidden = false;
  $("cancelEdit").hidden = false;
  $("form").scrollIntoView({ behavior: "smooth" });
  render();
}
function stopEdit() {
  editingId = null;
  ["name", "phone", "notes"].forEach(f => $(f).value = "");
  $("submitBtn").textContent = "Reserve table";
  $("editNote").hidden = true;
  $("cancelEdit").hidden = true;
  render();
}

// ---------- 5. Confirmation slip ----------
function showSlip(b) {
  const rows = [
    ["Booking ref", "TW-" + String(b.id).slice(-5)], ["Name", b.name], ["Phone", b.phone],
    ["Date", b.date], ["Time", b.slot], ["Guests", b.party], ["Table", "T" + b.table]
  ];
  if (b.notes) rows.push(["Request", b.notes]);
  $("slipBody").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(String(v))}</dd>`).join("");
  $("slip").hidden = false;
}

// ---------- 6. Events ----------
$("form").addEventListener("submit", e => {
  e.preventDefault();
  const d = {
    name: $("name").value.trim(),
    phone: $("phone").value.trim(),
    date: $("date").value,
    slot: $("slot").value,
    party: parseInt($("party").value, 10),
    notes: $("notes").value.trim()
  };
  const error = validate(d);
  if (error) return showMsg(error, "err");

  editingId ? updateBooking(d) : createBooking(d);
  save(); render();
});

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  ["bookings", "waitlist", "activityList"].forEach(id => $(id).hidden = id !== name);
}

document.addEventListener("click", e => {
  const tab = e.target.closest(".tab");
  if (tab) return switchTab(tab.dataset.tab);

  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = Number(btn.dataset.id);

  if (btn.dataset.act === "edit") return startEdit(id);
  if (btn.dataset.act === "cancel") {
    if (!confirm("Cancel this booking?")) return;
    cancelBooking(id);
  } else {
    const w = waitlist.find(x => x.id === id);
    waitlist = waitlist.filter(x => x.id !== id);
    log(`${w.name} was removed from the waitlist.`);
    showMsg("Removed from the waitlist.", "ok");
  }
  save(); render();
});

// ---------- 7. Demo tools (useful for testing and the video) ----------
function fillDemo() {
  const date = $("date").value, slot = $("slot").value;
  let i = bookings.length + 1;
  while (TABLES.length - takenIds(date, slot).length > 1) {
    const t = findTable(date, slot, 2);
    bookings.push({ id: Date.now() + i, name: "Guest " + i, phone: "98000" + String(10000 + i).slice(-5),
                    date, slot, party: 2, notes: "", table: t.id });
    i++;
  }
  log(`Demo bookings added for ${date}, ${slot}.`);
  save(); render();
  showToast("Demo bookings added. One table is left free.");
}
function resetAll() {
  if (!confirm("Delete all bookings, waitlist and activity?")) return;
  bookings = []; waitlist = []; activity = [];
  $("slip").hidden = true;
  stopEdit(); save(); render();
  showToast("All data cleared.");
}

// ---------- 8. Display ----------
function renderStats() {
  const date = $("date").value, slot = $("slot").value;
  const dayBookings = bookings.filter(b => b.date === date);
  $("sFree").textContent = TABLES.length - takenIds(date, slot).length;
  $("sBook").textContent = dayBookings.length;
  $("sWait").textContent = waitlist.filter(w => w.date === date).length;
  $("sGuests").textContent = dayBookings.reduce((n, b) => n + b.party, 0);
}

function renderFloor() {
  const date = $("date").value, slot = $("slot").value;
  $("when").textContent = date ? `${date} at ${slot}` : "the selected day";
  $("floor").innerHTML = TABLES.map(t => {
    const b = bookings.find(x => x.date === date && x.slot === slot && x.table === t.id);
    return `<div class="table ${b ? "taken" : ""}" title="${b ? "Booked by " + esc(b.name) : "Free"}">
      T${t.id}<small>${t.seats} seats${b ? " | booked" : ""}</small></div>`;
  }).join("");
}

function renderLists() {
  const q = $("search").value.trim().toLowerCase();
  const day = $("dateFilter").value;
  const match = x => x.name.toLowerCase().includes(q) && (!day || x.date === day);
  const byTime = (a, b) => (a.date + a.slot).localeCompare(b.date + b.slot);

  const b = bookings.filter(match).sort(byTime);
  $("bookings").innerHTML = b.length ? b.map(x => `
    <li>
      <span><strong>${esc(x.name)}</strong> | ${x.date}, ${x.slot} | ${x.party} guests | Table ${x.table}
        ${x.notes ? `<br><small>Request: ${esc(x.notes)}</small>` : ""}</span>
      <span class="acts">
        <button data-act="edit" data-id="${x.id}">Edit</button>
        <button class="danger" data-act="cancel" data-id="${x.id}">Cancel</button>
      </span>
    </li>`).join("")
    : `<li class="empty">No bookings found. Reserve a table to see it here.</li>`;

  const w = waitlist.filter(match);
  $("waitlist").innerHTML = w.length ? w.map(x => {
    const pos = waitlistPosition(x);
    return `<li>
      <span><span class="badge">#${pos}</span> <strong>${esc(x.name)}</strong> | ${x.date}, ${x.slot} | ${x.party} guests
        <br><small>Estimated wait: about ${pos * MINUTES_PER_PARTY} minutes</small></span>
      <button class="danger" data-act="remove" data-id="${x.id}">Remove</button>
    </li>`;
  }).join("") : `<li class="empty">Nobody is waiting.</li>`;

  $("activityList").innerHTML = activity.length
    ? activity.map(a => `<li><span>${esc(a.text)}</span><time>${a.time}</time></li>`).join("")
    : `<li class="empty">Nothing has happened yet.</li>`;

  $("bc").textContent = bookings.length;
  $("wc").textContent = waitlist.length;
}

function render() { renderStats(); renderFloor(); renderLists(); }

// ---------- 9. Theme ----------
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("theme").textContent = theme === "dark" ? "Light mode" : "Dark mode";
  localStorage.setItem("theme", theme);
}

// ---------- 10. Start ----------
$("slot").innerHTML = SLOTS.map(s => `<option>${s}</option>`).join("");
$("date").value = today();
$("date").min = today();
["date", "slot"].forEach(id => $(id).addEventListener("change", render));
$("search").addEventListener("input", renderLists);
$("dateFilter").addEventListener("change", renderLists);
$("clearFilter").addEventListener("click", () => { $("search").value = ""; $("dateFilter").value = ""; renderLists(); });
$("cancelEdit").addEventListener("click", stopEdit);
$("printBtn").addEventListener("click", () => window.print());
$("demoBtn").addEventListener("click", fillDemo);
$("resetBtn").addEventListener("click", resetAll);
$("theme").addEventListener("click", () =>
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
setTheme(localStorage.getItem("theme") || "light");
render();