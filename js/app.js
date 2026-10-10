/* =========================================================
   CarsotoCare — Aplikasi Manajemen Car Wash & Perawatan
   Frontend murni + localStorage. Tanpa backend.
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- Konstanta & Storage ---------------- */
  const KEYS = {
    session: "carsotocare_session",
    orders: "carsotocare_orders",
    items: "carsotocare_items",
    services: "carsotocare_services",
    customers: "carsotocare_customers",
  };

  const STATUS = {
    baru: { label: "Baru", cls: "st-baru" },
    proses: { label: "Diproses", cls: "st-proses" },
    selesai: { label: "Selesai", cls: "st-selesai" },
    diambil: { label: "LUNAS", cls: "st-lunas" },
  };
  const STATUS_FLOW = ["baru", "proses", "selesai", "diambil"];
  const LOW_STOCK_THRESHOLD = 5;

  const DEFAULT_SERVICES = [
    { id: "svc-cuci-biasa", name: "Cuci Biasa", price: 25000 },
    { id: "svc-cuci-premium", name: "Cuci Premium", price: 40000 },
    { id: "svc-poles-body", name: "Poles Body", price: 150000 },
    { id: "svc-detailing", name: "Detailing", price: 250000 },
    { id: "svc-salon", name: "Salon Mobil", price: 100000 },
    { id: "svc-ganti-oli", name: "Ganti Oli", price: 50000 },
    { id: "svc-service", name: "Service", price: 75000 },
  ];

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
    remove(key) { localStorage.removeItem(key); },
  };

  const db = {
    orders: () => store.get(KEYS.orders, []),
    saveOrders: (v) => store.set(KEYS.orders, v),
    items: () => store.get(KEYS.items, []),
    saveItems: (v) => store.set(KEYS.items, v),
    customers: () => store.get(KEYS.customers, []),
    saveCustomers: (v) => store.set(KEYS.customers, v),
    services: () => {
      let v = store.get(KEYS.services, null);
      if (v === null) {
        v = DEFAULT_SERVICES.map((s) => ({ ...s }));
        store.set(KEYS.services, v);
      }
      return v;
    },
    saveServices: (v) => store.set(KEYS.services, v),
    session: () => store.get(KEYS.session, null),
    saveSession: (v) => store.set(KEYS.session, v),
    clearSession: () => store.remove(KEYS.session),
  };

  /* ---------------- Utilitas ---------------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function uid(prefix) {
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 7);
  }
  function formatIDR(n) {
    const num = Number(n) || 0;
    return new Intl.NumberFormat("id-ID", {
      style: "currency", currency: "IDR", minimumFractionDigits: 0,
    }).format(num);
  }
  function formatDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  }
  function showAlert(el, type, msg) {
    el.className = "alert alert-" + type + " mt-3 mb-0";
    el.textContent = msg;
    el.classList.remove("d-none");
  }
  function hideAlert(el) { el.classList.add("d-none"); }

  /* ---------------- State UI ---------------- */
  let currentUser = null;
  let orderTabStatus = "";

  const PAGE_META = {
    dashboard: { title: "Dashboard", subtitle: "Ringkasan aktivitas usaha Anda" },
    orders: { title: "Pesanan", subtitle: "Kelola pesanan dan status layanan" },
    customers: { title: "Pelanggan", subtitle: "Data pelanggan dan riwayat kendaraan" },
    items: { title: "Barang", subtitle: "Inventori produk dan stok" },
    services: { title: "Layanan", subtitle: "Kelola jenis layanan dan harganya" },
    reports: { title: "Laporan", subtitle: "Analisis pendapatan dan rekap pesanan" },
  };

  /* ---------------- Modal Konfirmasi ---------------- */
  let confirmCallback = null;
  let confirmCheckRequired = false;

  function askConfirm(message, opts = {}) {
    const title = opts.title || "Konfirmasi";
    const yesText = opts.yesText || "Ya, Lanjutkan";
    const yesClass = opts.yesClass || "btn-primary";
    $("#confirmTitle").textContent = title;
    $("#confirmMessage").textContent = message;
    const yesBtn = $("#confirmYes");
    yesBtn.textContent = yesText;
    yesBtn.className = "btn " + yesClass;

    const checkWrap = $("#confirmCheckWrap");
    const checkInput = $("#confirmCheck");
    if (opts.checkbox) {
      $("#confirmCheckLabel").textContent = opts.checkbox;
      checkInput.checked = false;
      confirmCheckRequired = true;
      checkWrap.classList.remove("d-none");
    } else {
      confirmCheckRequired = false;
      checkInput.checked = false;
      checkWrap.classList.add("d-none");
    }

    confirmCallback = typeof opts.onConfirm === "function" ? opts.onConfirm : null;
    bootstrap.Modal.getOrCreateInstance($("#confirmModal")).show();
  }

  function runConfirm() {
    if (confirmCheckRequired && !$("#confirmCheck").checked) {
      $("#confirmCheck").classList.add("is-invalid");
      return;
    }
    const cb = confirmCallback;
    confirmCallback = null;
    confirmCheckRequired = false;
    bootstrap.Modal.getOrCreateInstance($("#confirmModal")).hide();
    if (cb) cb();
  }

  /* ---------------- Autentikasi ---------------- */
  const ADMIN = {
    id: "u-admin", username: "admin", password: "admin123",
    name: "Admin", email: "admin@carsotocare.local",
  };

  function initAuth() {
    const session = db.session();
    if (session && session.userId === ADMIN.id) {
      currentUser = ADMIN; showApp(); return;
    }
    showAuth();
  }
  function showAuth() {
    $("#appScreen").classList.add("d-none");
    $("#authScreen").classList.remove("d-none");
  }
  function showApp() {
    $("#authScreen").classList.add("d-none");
    $("#appScreen").classList.remove("d-none");
    $("#userName").textContent = currentUser.name;
    $("#userEmail").textContent = currentUser.email;
    $("#userInitial").textContent = (currentUser.name || "U").charAt(0).toUpperCase();
    navigate("dashboard");
  }
  function handleLogin(e) {
    e.preventDefault();
    hideAlert($("#authAlert"));
    const username = $("#loginUsername").value.trim().toLowerCase();
    const pass = $("#loginPassword").value;
    if (username !== ADMIN.username || pass !== ADMIN.password) {
      showAlert($("#authAlert"), "danger", "Username atau kata sandi salah.");
      return;
    }
    db.saveSession({ userId: ADMIN.id, loginAt: new Date().toISOString() });
    currentUser = ADMIN;
    $("#loginForm").reset();
    showApp();
  }
  function handleLogout() {
    askConfirm("Yakin ingin keluar dari aplikasi?", {
      title: "Keluar", yesText: "Ya, Keluar", yesClass: "btn-danger",
      onConfirm: () => { db.clearSession(); currentUser = null; showAuth(); },
    });
  }

  /* ---------------- Sidebar (mobile) ---------------- */
  function openSidebar() {
    $("#sidebar").classList.add("open");
    $("#sidebarBackdrop").classList.add("show");
  }
  function closeSidebar() {
    $("#sidebar").classList.remove("open");
    $("#sidebarBackdrop").classList.remove("show");
  }

  /* ---------------- Navigasi ---------------- */
  function navigate(page) {
    if (!PAGE_META[page]) return;
    $$(".page").forEach((p) => p.classList.add("d-none"));
    $("#page-" + page).classList.remove("d-none");
    $$(".sidebar .nav-link").forEach((n) =>
      n.classList.toggle("active", n.dataset.page === page)
    );
    $("#pageTitle").textContent = PAGE_META[page].title;
    $("#pageSubtitle").textContent = PAGE_META[page].subtitle;

    if (page === "dashboard") renderDashboard();
    if (page === "orders") renderOrders();
    if (page === "customers") renderCustomers();
    if (page === "items") renderItems();
    if (page === "services") renderServices();
    if (page === "reports") renderReports();

    closeSidebar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------- Dashboard ---------------- */
  function updateOrdersDot() {
    const unprocessed = db.orders().filter((o) => o.status === "baru").length;
    $("#ordersNavDot").classList.toggle("d-none", unprocessed === 0);
  }

  function renderDashboard() {
    updateOrdersDot();
    const orders = db.orders();
    const items = db.items();
    const customers = db.customers();

    const totalRevenue = orders
      .filter((o) => ["selesai", "diambil"].includes(o.status))
      .reduce((s, o) => s + (Number(o.price) || 0), 0);
    const activeCount = orders.filter((o) => ["baru", "proses"].includes(o.status)).length;
    const lowStock = items.filter((i) => (Number(i.stock) || 0) <= LOW_STOCK_THRESHOLD);

    // Hitung data 7 hari terakhir untuk sparkline
    const last7 = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      return orders.filter((o) => (o.createdAt || "").slice(0, 10) === key).length;
    });
    const maxVal = Math.max(1, ...last7);
    const sparkHTML = `
    <div class="stat-spark">
      ${last7.map((v) => `<span style="height:${Math.round((v / maxVal) * 100)}%"></span>`).join("")}
    </div>`;

    const cards = [
      { cls: "bg-gold", icon: "bi-receipt", value: orders.length, label: "Total Pesanan", spark: sparkHTML },
      { cls: "bg-gold-deep", icon: "bi-cash-stack", value: formatIDR(totalRevenue), label: "Pendapatan (Selesai)", spark: sparkHTML },
      { cls: "bg-ink", icon: "bi-hourglass-split", value: activeCount, label: "Sedang Diproses", spark: sparkHTML },
      { cls: "bg-alert", icon: "bi-exclamation-triangle", value: lowStock.length, label: "Stok Menipis", spark: sparkHTML },
    ];

    $("#statCards").innerHTML = cards.map((c) => `
    <div class="col-6 col-xl-3">
      <div class="stat-card ${c.cls}">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <div class="icon"><i class="bi ${c.icon}"></i></div>
        </div>
        <div class="value">${c.value}</div>
        <div class="label">${c.label}</div>
        ${c.spark || ""}
      </div>
    </div>`).join("");

    const recent = [...orders]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
    if (!recent.length) {
      $("#recentOrders").innerHTML = '<div class="text-muted text-center py-4">Belum ada pesanan.</div>';
    } else {
      $("#recentOrders").innerHTML = `
        <ul class="list-group list-group-flush">
          ${recent.map((o) => `
            <li class="list-group-item d-flex justify-content-between align-items-center gap-2 px-0">
              <div class="min-w-0">
                <div class="fw-semibold text-truncate">${esc(o.customerName)}</div>
                <div class="text-muted small text-truncate">${esc(o.plate)} · ${esc(o.serviceType)}</div>
              </div>
              <div class="text-end flex-shrink-0">
                <span class="status-badge ${STATUS[o.status].cls}">${STATUS[o.status].label}</span>
                <div class="text-muted small">${formatDate(o.createdAt)}</div>
              </div>
            </li>`).join("")}
        </ul>`;
    }

    if (!lowStock.length) {
      $("#lowStock").innerHTML = '<div class="text-muted text-center py-4">Semua stok aman.</div>';
    } else {
      $("#lowStock").innerHTML = `
        <ul class="list-group list-group-flush">
          ${lowStock.slice(0, 6).map((i) => `
            <li class="list-group-item d-flex justify-content-between align-items-center px-0">
              <span class="text-truncate me-2">${esc(i.name)}</span>
              <span class="badge ${Number(i.stock) <= 0 ? "bg-danger" : "stock-low"}">${i.stock}</span>
            </li>`).join("")}
        </ul>`;
    }

    // Simpan count pelanggan untuk pemakaian lain
    void customers;
  }

  /* ---------------- Pesanan ---------------- */
  const ORDER_STATUS_TABS = [
    { key: "", label: "Semua" },
    { key: "baru", label: "Belum Diproses" },
    { key: "proses", label: "Diproses" },
    { key: "selesai", label: "Selesai" },
    { key: "diambil", label: "LUNAS" },
  ];

  function renderOrderTabs() {
    const orders = db.orders();
    const counts = {};
    orders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
    $("#orderStatusTabs").innerHTML = ORDER_STATUS_TABS.map((t) => {
      const count = t.key ? (counts[t.key] || 0) : orders.length;
      return `
        <button type="button" class="order-status-tab${orderTabStatus === t.key ? " active" : ""}" data-status="${t.key}">
          <span>${t.label}</span>
          <span class="tab-count">${count}</span>
        </button>`;
    }).join("");
  }

  function renderOrderAlert() {
    const unprocessed = db.orders().filter((o) => o.status === "baru").length;
    const el = $("#orderAlert");
    if (unprocessed > 0) {
      $("#orderAlertText").textContent =
        "Ada " + unprocessed + " pesanan yang belum diproses. Segera tindak lanjuti.";
      el.classList.remove("d-none");
    } else {
      el.classList.add("d-none");
    }
  }

  function renderOrders() {
    renderOrderTabs();
    renderOrderAlert();
    const q = ($("#orderSearch").value || "").toLowerCase();
    const status = orderTabStatus;
    let orders = db.orders();

    if (q) {
      orders = orders.filter((o) =>
        (o.customerName || "").toLowerCase().includes(q) ||
        (o.plate || "").toLowerCase().includes(q) ||
        (o.code || "").toLowerCase().includes(q));
    }
    if (status) orders = orders.filter((o) => o.status === status);
    orders = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const tbody = $("#ordersTableBody");
    $("#ordersEmpty").classList.toggle("d-none", orders.length > 0);

    if (!orders.length) { tbody.innerHTML = ""; return; }

    tbody.innerHTML = orders.map((o) => {
      const idx = STATUS_FLOW.indexOf(o.status);
      const next = STATUS_FLOW[idx + 1];
      return `
        <tr>
          <td data-label="Kode" class="fw-semibold">${esc(o.code)}</td>
          <td data-label="Pelanggan">
            <div>${esc(o.customerName)}</div>
            <div class="text-muted small">${esc(o.phone || "-")}</div>
          </td>
          <td data-label="Kendaraan">
            <div>${esc(o.plate)}</div>
            <div class="text-muted small">${esc(o.carType)}</div>
          </td>
          <td data-label="Layanan">${esc(o.serviceType)}</td>
          <td data-label="Harga">${formatIDR(o.price)}</td>
          <td data-label="Status"><span class="status-badge ${STATUS[o.status].cls}">${STATUS[o.status].label}</span></td>
          <td data-label="Tanggal">${formatDate(o.createdAt)}</td>
          <td data-label="Aksi" class="text-end text-nowrap">
            <button class="action-btn" title="Struk / QR" data-action="receipt" data-id="${o.id}"><i class="bi bi-qr-code"></i></button>
            <button class="action-btn" title="Edit" data-action="edit" data-id="${o.id}"><i class="bi bi-pencil-square"></i></button>
            ${next ? `<button class="action-btn" title="Tandai ${STATUS[next].label}" data-action="next" data-id="${o.id}"><i class="bi bi-arrow-right-circle"></i></button>` : ""}
            <button class="action-btn danger" title="Hapus" data-action="delete" data-id="${o.id}"><i class="bi bi-trash3"></i></button>
          </td>
        </tr>`;
    }).join("");
  }

  /* ---- Form pesanan: barang ---- */
  function orderItemRowHTML(items, sel) {
    const selectedId = sel ? sel.itemId : "";
    const qty = (sel && sel.qty) ? sel.qty : 1;
    const opts = items.map((i) => {
      const s = i.id === selectedId ? " selected" : "";
      return `<option value="${i.id}" data-name="${esc(i.name)}" data-price="${Number(i.price) || 0}"${s}>${esc(i.name)} (stok: ${Number(i.stock) || 0}) — ${formatIDR(i.price)}</option>`;
    }).join("");
    return `
      <div class="order-item-row d-flex gap-2 align-items-center mb-2">
        <select class="form-select form-select-sm order-item-select">
          <option value="">-- Pilih Barang --</option>
          ${opts}
        </select>
        <input type="number" class="form-control form-control-sm order-item-qty" min="1" value="${qty}" style="max-width:80px" title="Jumlah">
        <button type="button" class="btn btn-sm btn-outline-danger order-item-remove" title="Hapus"><i class="bi bi-x-lg"></i></button>
      </div>`;
  }

  function renderOrderItems(selected) {
    const items = db.items();
    const rows = (selected && selected.length) ? selected : [{}];
    $("#orderItemsList").innerHTML = rows.map((s) => orderItemRowHTML(items, s)).join("");
  }

  function orderItemsFromForm() {
    const items = db.items();
    const out = [];
    $$("#orderItemsList .order-item-row").forEach((row) => {
      const sel = row.querySelector(".order-item-select");
      const qty = Number(row.querySelector(".order-item-qty").value) || 0;
      if (!sel.value || qty < 1) return;
      const it = items.find((x) => x.id === sel.value);
      out.push({ itemId: sel.value, name: it ? it.name : "Barang", qty, price: it ? (Number(it.price) || 0) : 0 });
    });
    return out;
  }

  function orderPriceCalc() {
    const items = orderItemsFromForm();
    const subtotal = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
    const fee = Number($("#orderServiceFee").value) || 0;
    return { subtotal, fee, total: subtotal + fee };
  }

  function recalculateOrderPrice() {
    const { subtotal, fee, total } = orderPriceCalc();
    $("#orderSubtotal").textContent = formatIDR(subtotal);
    $("#orderFeeDisplay").textContent = formatIDR(fee);
    $("#orderTotalDisplay").textContent = formatIDR(total);
  }

  function applyStockDelta(deltas) {
    const items = db.items();
    items.forEach((it) => {
      if (deltas[it.id]) {
        it.stock = (Number(it.stock) || 0) - deltas[it.id];
        if (it.stock < 0) it.stock = 0;
      }
    });
    db.saveItems(items);
  }

  /* ---- Dropdown pelanggan di form pesanan ---- */
  function renderCustomerOptions(selectedId) {
    const customers = db.customers();
    const sel = $("#orderCustomerSelect");
    let options = `<option value="">-- Pelanggan Baru / Manual --</option>`;
    options += customers.map((c) => {
      const s = c.id === selectedId ? " selected" : "";
      const plat = c.plate ? " · " + esc(c.plate) : "";
      return `<option value="${c.id}"${s}>${esc(c.name)}${plat}</option>`;
    }).join("");
    sel.innerHTML = options;
  }

  function fillOrderFormFromCustomer(customerId) {
    const c = db.customers().find((x) => x.id === customerId);
    if (!c) return;
    $("#orderCustomer").value = c.name || "";
    $("#orderPhone").value = c.phone || "";
    if (c.plate) $("#orderPlate").value = c.plate;
    if (c.carType) {
      const sel = $("#orderCarType");
      if (Array.from(sel.options).some((o) => o.value === c.carType)) {
        sel.value = c.carType;
      }
    }
  }

  /* ---- Cari/buat pelanggan otomatis dari pesanan ---- */
  function findOrCreateCustomerFromOrder(data) {
    if (!data.customerName) return;
    const customers = db.customers();
    const key = data.customerName.trim().toLowerCase();
    let cust = customers.find((c) => (c.name || "").trim().toLowerCase() === key);
    if (!cust) {
      cust = {
        id: uid("c"),
        name: data.customerName.trim(),
        phone: data.phone || "",
        email: "",
        plate: data.plate || "",
        carType: data.carType || "",
        address: "",
        notes: "",
        createdAt: new Date().toISOString(),
      };
      customers.push(cust);
    } else {
      // Perbarui data yang kosong / berubah
      if (!cust.phone && data.phone) cust.phone = data.phone;
      if (!cust.plate && data.plate) cust.plate = data.plate;
      if (!cust.carType && data.carType) cust.carType = data.carType;
    }
    db.saveCustomers(customers);
    return cust;
  }

  function openOrderForm(id) {
    const form = $("#orderForm");
    form.reset();
    $("#orderId").value = "";
    $("#orderModalTitle").textContent = "Pesanan Baru";
    let items = [];
    let serviceName = "";
    let serviceFee = 0;
    let customerId = "";

    if (id) {
      const o = db.orders().find((x) => x.id === id);
      if (o) {
        $("#orderModalTitle").textContent = "Edit Pesanan";
        $("#orderId").value = o.id;
        $("#orderCustomer").value = o.customerName;
        $("#orderPhone").value = o.phone || "";
        $("#orderPlate").value = o.plate;
        $("#orderCarType").value = o.carType;
        serviceName = o.serviceType || "";
        serviceFee = (o.serviceFee != null ? o.serviceFee : 0);
        $("#orderNotes").value = o.notes || "";
        items = o.items || [];
        customerId = o.customerId || "";
      }
    }

    renderCustomerOptions(customerId);
    renderServiceOptions(serviceName || undefined);
    $("#orderServiceFee").value = id ? serviceFee : 0;
    renderOrderItems(items);
    recalculateOrderPrice();
    bootstrap.Modal.getOrCreateInstance($("#orderModal")).show();
  }

  function saveOrder(e) {
    e.preventDefault();
    const id = $("#orderId").value;
    const customerName = $("#orderCustomer").value.trim();
    const plate = $("#orderPlate").value.trim();
    if (!customerName || !plate) {
      alert("Nama pelanggan dan plat nomor wajib diisi.");
      return;
    }
    const isEdit = !!id;
    askConfirm(
      isEdit ? "Simpan perubahan pada pesanan ini?" : "Simpan pesanan baru ini?",
      { title: "Simpan Pesanan", yesText: "Ya, Simpan", onConfirm: () => persistOrder(id) }
    );
  }

  function persistOrder(id) {
    const data = {
      customerName: $("#orderCustomer").value.trim(),
      phone: $("#orderPhone").value.trim(),
      plate: $("#orderPlate").value.trim(),
      carType: $("#orderCarType").value,
      serviceType: $("#orderService").value.trim() || "Tanpa Layanan",
      notes: $("#orderNotes").value.trim(),
    };

    const newItems = orderItemsFromForm();
    const calc = orderPriceCalc();
    data.itemSubtotal = calc.subtotal;
    data.serviceFee = calc.fee;
    data.price = calc.total;

    const orders = db.orders();
    const items = db.items();

    const deltas = {};
    if (id) {
      const existing = orders.find((x) => x.id === id);
      if (existing && existing.items) {
        existing.items.forEach((oi) => { deltas[oi.itemId] = (deltas[oi.itemId] || 0) - Number(oi.qty || 0); });
      }
    }
    newItems.forEach((fi) => { deltas[fi.itemId] = (deltas[fi.itemId] || 0) + Number(fi.qty || 0); });

    for (const iid of Object.keys(deltas)) {
      const d = deltas[iid];
      if (d <= 0) continue;
      const it = items.find((x) => x.id === iid);
      if (it && (Number(it.stock) || 0) < d) {
        alert("Stok \"" + it.name + "\" tidak cukup. Sisa stok: " + (Number(it.stock) || 0) + ".");
        return;
      }
    }

    applyStockDelta(deltas);
    data.items = newItems;

    // Simpan / hubungkan pelanggan
    const cust = findOrCreateCustomerFromOrder(data);
    if (cust) data.customerId = cust.id;

    if (id) {
      const idx = orders.findIndex((x) => x.id === id);
      if (idx >= 0) orders[idx] = { ...orders[idx], ...data };
    } else {
      orders.push({
        ...data,
        id: uid("o"),
        code: "ORD-" + new Date().getFullYear() + "-" + String(orders.length + 1).padStart(4, "0"),
        status: "baru",
        createdAt: new Date().toISOString(),
      });
    }
    db.saveOrders(orders);
    bootstrap.Modal.getOrCreateInstance($("#orderModal")).hide();
    renderOrders();
    renderItems();
    renderCustomers();
    renderDashboard();
  }

  function advanceOrder(id) {
    const orders = db.orders();
    const order = orders.find((x) => x.id === id);
    if (!order) return;
    const i = STATUS_FLOW.indexOf(order.status);
    if (i < 0 || i >= STATUS_FLOW.length - 1) return;
    const nextStatus = STATUS_FLOW[i + 1];

    if (nextStatus === "diambil") {
      askConfirm(
        "Pesanan \"" + (order.code || "") + "\" — Total: " + formatIDR(order.price) +
        ". Konfirmasi pembayaran dari pelanggan sudah diterima?",
        {
          title: "Konfirmasi Pembayaran", yesText: "Ya, Sudah Bayar", yesClass: "btn-success",
          checkbox: "Pembayaran sudah diterima (LUNAS)",
          onConfirm: () => applyStatusChange(id, nextStatus),
        }
      );
      return;
    }

    askConfirm(
      "Ubah status pesanan \"" + (order.code || "") + "\" menjadi \"" + STATUS[nextStatus].label + "\"?",
      {
        title: "Ubah Status Pesanan", yesText: "Ya, " + STATUS[nextStatus].label,
        onConfirm: () => applyStatusChange(id, nextStatus)
      }
    );
  }

  function applyStatusChange(id, nextStatus) {
    const fresh = db.orders();
    const idx = fresh.findIndex((x) => x.id === id);
    if (idx < 0) return;
    fresh[idx].status = nextStatus;
    db.saveOrders(fresh);
    renderOrders();
    renderDashboard();
  }

  function deleteOrder(id) {
    const order = db.orders().find((x) => x.id === id);
    if (!order) return;
    askConfirm(
      "Hapus pesanan \"" + (order.code || "") + "\"? Stok barang yang terpakai akan dikembalikan.",
      {
        title: "Hapus Pesanan", yesText: "Ya, Hapus", yesClass: "btn-danger",
        onConfirm: () => {
          const orders = db.orders();
          const target = orders.find((x) => x.id === id);
          if (target && target.items && target.items.length) {
            const items = db.items();
            target.items.forEach((oi) => {
              const it = items.find((x) => x.id === oi.itemId);
              if (it) it.stock = (Number(it.stock) || 0) + (Number(oi.qty) || 0);
            });
            db.saveItems(items);
          }
          db.saveOrders(orders.filter((x) => x.id !== id));
          renderOrders(); renderItems(); renderDashboard();
        },
      }
    );
  }

  /* ---------------- Struk & QR ---------------- */
  function openReceipt(id) {
    const o = db.orders().find((x) => x.id === id);
    if (!o) return;

    $("#receiptBody").innerHTML = `
      <div class="d-flex justify-content-between"><span>Kode</span><strong>${esc(o.code)}</strong></div>
      <div class="d-flex justify-content-between"><span>Tanggal</span><strong>${formatDate(o.createdAt)}</strong></div>
      <hr class="my-2">
      <div class="d-flex justify-content-between"><span>Pelanggan</span><strong>${esc(o.customerName)}</strong></div>
      <div class="d-flex justify-content-between"><span>Plat</span><strong>${esc(o.plate)}</strong></div>
      <div class="d-flex justify-content-between"><span>Kendaraan</span><strong>${esc(o.carType)}</strong></div>
      <div class="d-flex justify-content-between"><span>Layanan</span><strong>${esc(o.serviceType)}</strong></div>
      ${o.items && o.items.length ? `
      <hr class="my-2">
      <div class="mb-1">Barang Terpakai</div>
      ${o.items.map((it) => {
      const p = Number(it.price) || 0;
      const sub = p * (Number(it.qty) || 0);
      return `<div class="d-flex justify-content-between small text-muted"><span>${esc(it.name)} × ${it.qty}</span><span>${formatIDR(sub)}</span></div>`;
    }).join("")}` : ""}
      <hr class="my-2">
      <div class="d-flex justify-content-between"><span>Subtotal Barang</span><strong>${formatIDR(o.itemSubtotal || 0)}</strong></div>
      <div class="d-flex justify-content-between"><span>Biaya Service Mekanik</span><strong>${formatIDR(o.serviceFee || 0)}</strong></div>
      <div class="d-flex justify-content-between"><span>Total</span><strong>${formatIDR(o.price)}</strong></div>
      <div class="d-flex justify-content-between"><span>Status</span><strong>${STATUS[o.status].label}</strong></div>
    `;

    const qrBox = $("#qrBox");
    qrBox.innerHTML = "";
    const payload = JSON.stringify({
      app: "CarsotoCare", code: o.code, customer: o.customerName, plate: o.plate,
      service: o.serviceType,
      items: (o.items || []).map((it) => it.name + " x" + it.qty),
      price: o.price, status: o.status, date: o.createdAt,
    });
    try {
      new QRCode(qrBox, { text: payload, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.M });
    } catch (err) {
      qrBox.innerHTML = '<div class="text-muted small">QR tidak dapat dimuat.</div>';
    }

    bootstrap.Modal.getOrCreateInstance($("#receiptModal")).show();
  }

  /* ---------------- Pelanggan (BARU) ---------------- */
  function renderCustomers() {
    const q = ($("#customerSearch").value || "").toLowerCase();
    const orders = db.orders();
    let customers = db.customers();

    if (q) {
      customers = customers.filter((c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.plate || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q));
    }
    customers = [...customers].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const tbody = $("#customersTableBody");
    $("#customersEmpty").classList.toggle("d-none", customers.length > 0);
    if (!customers.length) { tbody.innerHTML = ""; return; }

    tbody.innerHTML = customers.map((c) => {
      const count = orders.filter((o) =>
        o.customerId === c.id ||
        (o.customerName || "").trim().toLowerCase() === (c.name || "").trim().toLowerCase()
      ).length;
      return `
        <tr>
          <td data-label="Nama" class="fw-semibold">${esc(c.name)}</td>
          <td data-label="No. HP">${esc(c.phone || "-")}</td>
          <td data-label="Email" class="text-truncate">${esc(c.email || "-")}</td>
          <td data-label="Plat">${esc(c.plate || "-")}</td>
          <td data-label="Kendaraan">${esc(c.carType || "-")}</td>
          <td data-label="Pesanan"><span class="badge bg-secondary">${count}</span></td>
          <td data-label="Aksi" class="text-end text-nowrap">
            <button class="action-btn" title="Edit" data-action="edit" data-id="${c.id}"><i class="bi bi-pencil-square"></i></button>
            <button class="action-btn danger" title="Hapus" data-action="delete" data-id="${c.id}"><i class="bi bi-trash3"></i></button>
          </td>
        </tr>`;
    }).join("");
  }

  function openCustomerForm(id) {
    const form = $("#customerForm");
    form.reset();
    $("#customerId").value = "";
    $("#customerModalTitle").textContent = "Tambah Pelanggan";

    if (id) {
      const c = db.customers().find((x) => x.id === id);
      if (c) {
        $("#customerModalTitle").textContent = "Edit Pelanggan";
        $("#customerId").value = c.id;
        $("#customerName").value = c.name || "";
        $("#customerPhone").value = c.phone || "";
        $("#customerEmail").value = c.email || "";
        $("#customerPlate").value = c.plate || "";
        $("#customerCarType").value = c.carType || "";
        $("#customerAddress").value = c.address || "";
        $("#customerNotes").value = c.notes || "";
      }
    }
    bootstrap.Modal.getOrCreateInstance($("#customerModal")).show();
  }

  function saveCustomer(e) {
    e.preventDefault();
    const id = $("#customerId").value;
    const name = $("#customerName").value.trim();
    if (!name) { alert("Nama pelanggan wajib diisi."); return; }
    const isEdit = !!id;
    askConfirm(
      isEdit ? "Simpan perubahan pada pelanggan ini?" : "Simpan pelanggan baru ini?",
      {
        title: "Simpan Pelanggan", yesText: "Ya, Simpan",
        onConfirm: () => persistCustomer(id)
      }
    );
  }

  function persistCustomer(id) {
    const data = {
      name: $("#customerName").value.trim(),
      phone: $("#customerPhone").value.trim(),
      email: $("#customerEmail").value.trim(),
      plate: $("#customerPlate").value.trim(),
      carType: $("#customerCarType").value,
      address: $("#customerAddress").value.trim(),
      notes: $("#customerNotes").value.trim(),
    };
    const customers = db.customers();
    if (id) {
      const idx = customers.findIndex((x) => x.id === id);
      if (idx >= 0) customers[idx] = { ...customers[idx], ...data };
    } else {
      customers.push({ ...data, id: uid("c"), createdAt: new Date().toISOString() });
    }
    db.saveCustomers(customers);
    bootstrap.Modal.getOrCreateInstance($("#customerModal")).hide();
    renderCustomers();
    renderDashboard();
  }

  function deleteCustomer(id) {
    const c = db.customers().find((x) => x.id === id);
    if (!c) return;
    askConfirm(
      "Hapus pelanggan \"" + (c.name || "") + "\"? Pesanan lama tetap tersimpan.",
      {
        title: "Hapus Pelanggan", yesText: "Ya, Hapus", yesClass: "btn-danger",
        onConfirm: () => {
          db.saveCustomers(db.customers().filter((x) => x.id !== id));
          renderCustomers();
          renderDashboard();
        },
      }
    );
  }

  /* ---------------- Barang ---------------- */
  function renderItems() {
    const q = ($("#itemSearch").value || "").toLowerCase();
    let items = db.items();
    if (q) items = items.filter((i) => (i.name || "").toLowerCase().includes(q));
    items = [...items].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const tbody = $("#itemsTableBody");
    $("#itemsEmpty").classList.toggle("d-none", items.length > 0);
    if (!items.length) { tbody.innerHTML = ""; return; }

    tbody.innerHTML = items.map((i) => {
      const stock = Number(i.stock) || 0;
      const badge = stock <= 0
        ? '<span class="badge bg-danger">Habis</span>'
        : stock <= LOW_STOCK_THRESHOLD
          ? '<span class="badge stock-low">Menipis</span>'
          : '<span class="badge bg-success">Tersedia</span>';
      return `
        <tr>
          <td data-label="Nama" class="fw-semibold">${esc(i.name)}</td>
          <td data-label="Kategori">${esc(i.category)}</td>
          <td data-label="Stok">${stock}</td>
          <td data-label="Harga Beli">${formatIDR(i.cost)}</td>
          <td data-label="Harga Jual">${formatIDR(i.price)}</td>
          <td data-label="Status">${badge}</td>
          <td data-label="Aksi" class="text-end text-nowrap">
            <button class="action-btn" title="Edit" data-action="edit" data-id="${i.id}"><i class="bi bi-pencil-square"></i></button>
            <button class="action-btn danger" title="Hapus" data-action="delete" data-id="${i.id}"><i class="bi bi-trash3"></i></button>
          </td>
        </tr>`;
    }).join("");
  }

  function openItemForm(id) {
    const form = $("#itemForm");
    form.reset();
    $("#itemId").value = "";
    $("#itemModalTitle").textContent = "Tambah Barang";

    if (id) {
      const i = db.items().find((x) => x.id === id);
      if (i) {
        $("#itemModalTitle").textContent = "Edit Barang";
        $("#itemId").value = i.id;
        $("#itemName").value = i.name;
        $("#itemCategory").value = i.category;
        $("#itemStock").value = i.stock;
        $("#itemCost").value = i.cost;
        $("#itemPrice").value = i.price;
      }
    }
    bootstrap.Modal.getOrCreateInstance($("#itemModal")).show();
  }

  function saveItem(e) {
    e.preventDefault();
    const id = $("#itemId").value;
    const name = $("#itemName").value.trim();
    if (!name) { alert("Nama barang wajib diisi."); return; }
    const isEdit = !!id;
    askConfirm(
      isEdit ? "Simpan perubahan pada barang ini?" : "Simpan barang baru ini?",
      { title: "Simpan Barang", yesText: "Ya, Simpan", onConfirm: () => persistItem(id) }
    );
  }

  function persistItem(id) {
    const data = {
      name: $("#itemName").value.trim(),
      category: $("#itemCategory").value,
      stock: Number($("#itemStock").value) || 0,
      cost: Number($("#itemCost").value) || 0,
      price: Number($("#itemPrice").value) || 0,
    };
    const items = db.items();
    if (id) {
      const idx = items.findIndex((x) => x.id === id);
      if (idx >= 0) items[idx] = { ...items[idx], ...data };
    } else {
      items.push({ ...data, id: uid("i"), createdAt: new Date().toISOString() });
    }
    db.saveItems(items);
    bootstrap.Modal.getOrCreateInstance($("#itemModal")).hide();
    renderItems(); renderDashboard();
  }

  function deleteItem(id) {
    const item = db.items().find((x) => x.id === id);
    if (!item) return;
    askConfirm("Hapus barang \"" + (item.name || "") + "\"?", {
      title: "Hapus Barang", yesText: "Ya, Hapus", yesClass: "btn-danger",
      onConfirm: () => {
        db.saveItems(db.items().filter((x) => x.id !== id));
        renderItems(); renderDashboard();
      },
    });
  }

  /* ---------------- Layanan ---------------- */
  function renderServiceOptions(selectedName) {
    const services = db.services();
    const sel = $("#orderService");
    const noneLabel = "Tanpa Layanan";
    const isNone = !selectedName || selectedName === noneLabel;
    let options = `<option value=""${isNone ? " selected" : ""}>${noneLabel}</option>`;
    options += services.map((s) =>
      `<option value="${esc(s.name)}"${s.name === selectedName ? " selected" : ""}>${esc(s.name)} — ${formatIDR(s.price)}</option>`
    ).join("");
    if (!isNone && !services.some((s) => s.name === selectedName)) {
      options = `<option value="${esc(selectedName)}" selected>${esc(selectedName)}</option>` + options;
    }
    sel.innerHTML = options;
  }

  function renderServices() {
    const q = ($("#serviceSearch").value || "").toLowerCase();
    let services = db.services();
    if (q) services = services.filter((s) => (s.name || "").toLowerCase().includes(q));
    services = [...services].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const tbody = $("#servicesTableBody");
    $("#servicesEmpty").classList.toggle("d-none", services.length > 0);
    if (!services.length) { tbody.innerHTML = ""; return; }

    tbody.innerHTML = services.map((s) => `
      <tr>
        <td data-label="Nama Layanan" class="fw-semibold">${esc(s.name)}</td>
        <td data-label="Harga" class="text-end">${formatIDR(s.price)}</td>
        <td data-label="Aksi" class="text-end text-nowrap">
          <button class="action-btn" title="Edit" data-action="edit" data-id="${s.id}"><i class="bi bi-pencil-square"></i></button>
          <button class="action-btn danger" title="Hapus" data-action="delete" data-id="${s.id}"><i class="bi bi-trash3"></i></button>
        </td>
      </tr>`).join("");
  }

  function openServiceForm(id) {
    const form = $("#serviceForm");
    form.reset();
    $("#serviceId").value = "";
    $("#serviceModalTitle").textContent = "Tambah Layanan";

    if (id) {
      const s = db.services().find((x) => x.id === id);
      if (s) {
        $("#serviceModalTitle").textContent = "Edit Layanan";
        $("#serviceId").value = s.id;
        $("#serviceName").value = s.name;
        $("#servicePrice").value = s.price;
      }
    }
    bootstrap.Modal.getOrCreateInstance($("#serviceModal")).show();
  }

  function saveService(e) {
    e.preventDefault();
    const id = $("#serviceId").value;
    const name = $("#serviceName").value.trim();
    const price = Number($("#servicePrice").value) || 0;
    if (!name) { alert("Nama layanan wajib diisi."); return; }
    const isEdit = !!id;
    askConfirm(
      isEdit ? "Simpan perubahan pada layanan ini?" : "Simpan layanan baru ini?",
      {
        title: "Simpan Layanan", yesText: "Ya, Simpan",
        onConfirm: () => persistService(id, name, price)
      }
    );
  }

  function persistService(id, name, price) {
    const services = db.services();
    if (id) {
      const idx = services.findIndex((x) => x.id === id);
      if (idx >= 0) services[idx] = { ...services[idx], name, price };
    } else {
      services.push({ id: uid("svc"), name, price });
    }
    db.saveServices(services);
    bootstrap.Modal.getOrCreateInstance($("#serviceModal")).hide();
    renderServices();
  }

  function deleteService(id) {
    const svc = db.services().find((x) => x.id === id);
    if (!svc) return;
    askConfirm("Hapus layanan \"" + (svc.name || "") + "\"?", {
      title: "Hapus Layanan", yesText: "Ya, Hapus", yesClass: "btn-danger",
      onConfirm: () => {
        db.saveServices(db.services().filter((x) => x.id !== id));
        renderServices();
      },
    });
  }

  /* ---------------- Laporan ---------------- */
  function reportFiltered() {
    let orders = db.orders();
    const from = $("#reportFrom").value;
    const to = $("#reportTo").value;
    if (from) orders = orders.filter((o) => (o.createdAt || "").slice(0, 10) >= from);
    if (to) orders = orders.filter((o) => (o.createdAt || "").slice(0, 10) <= to);
    return orders;
  }

  function renderReports() {
    const orders = reportFiltered().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const revenue = orders
      .filter((o) => ["selesai", "diambil"].includes(o.status))
      .reduce((s, o) => s + (Number(o.price) || 0), 0);

    const byService = {};
    orders.forEach((o) => { byService[o.serviceType] = (byService[o.serviceType] || 0) + 1; });

    $("#reportSummary").innerHTML = `
      <div class="col-12 col-md-4">
        <div class="stat-card bg-gold">
          <div class="icon mb-3"><i class="bi bi-receipt"></i></div>
          <div class="value">${orders.length}</div>
          <div class="label">Total Pesanan</div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="stat-card bg-gold-deep">
          <div class="icon mb-3"><i class="bi bi-cash-stack"></i></div>
          <div class="value">${formatIDR(revenue)}</div>
          <div class="label">Pendapatan (Selesai)</div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="stat-card bg-ink">
          <div class="icon mb-3"><i class="bi bi-tags"></i></div>
          <div class="value">${Object.keys(byService).length}</div>
          <div class="label">Jenis Layanan</div>
        </div>
      </div>`;

    const tbody = $("#reportTableBody");
    if (!orders.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Tidak ada data pada rentang tanggal ini.</td></tr>';
      return;
    }
    tbody.innerHTML = orders.map((o) => `
      <tr>
        <td data-label="Kode" class="fw-semibold">${esc(o.code)}</td>
        <td data-label="Pelanggan">${esc(o.customerName)}</td>
        <td data-label="Layanan">${esc(o.serviceType)}</td>
        <td data-label="Status"><span class="status-badge ${STATUS[o.status].cls}">${STATUS[o.status].label}</span></td>
        <td data-label="Tanggal">${formatDate(o.createdAt)}</td>
        <td data-label="Harga" class="text-end">${formatIDR(o.price)}</td>
      </tr>`).join("");
  }

  function exportPDF() {
    const orders = reportFiltered().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const revenue = orders
      .filter((o) => ["selesai", "diambil"].includes(o.status))
      .reduce((s, o) => s + (Number(o.price) || 0), 0);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    doc.setFontSize(16);
    doc.setTextColor(169, 128, 32);
    doc.text("CarsotoCare", 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text("Laporan Pesanan", 14, 28);
    doc.setFontSize(9);
    doc.setTextColor(100);
    const range = ($("#reportFrom").value ? "Dari " + formatDate($("#reportFrom").value) : "Semua tanggal") +
      ($("#reportTo").value ? " s/d " + formatDate($("#reportTo").value) : "");
    doc.text("Periode: " + range, 14, 34);
    doc.text("Dibuat: " + new Date().toLocaleString("id-ID"), 14, 39);

    doc.autoTable({
      startY: 44,
      head: [["Kode", "Pelanggan", "Layanan", "Status", "Tanggal", "Harga"]],
      body: orders.map((o) => [
        o.code, o.customerName, o.serviceType,
        STATUS[o.status].label, formatDate(o.createdAt), formatIDR(o.price),
      ]),
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [169, 128, 32] },
    });

    let y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    doc.setTextColor(30);
    doc.text("Total Pesanan: " + orders.length, 14, y);
    doc.text("Total Pendapatan (Selesai): " + formatIDR(revenue), 14, y + 6);

    doc.save("laporan-carsotocare.pdf");
  }

  function printReceipt() { window.print(); }

  /* ---------------- Event Binding ---------------- */
  function bindEvents() {
    // Auth
    $("#loginForm").addEventListener("submit", handleLogin);
    $$("[data-toggle-pass]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = $("#" + btn.dataset.togglePass);
        input.type = input.type === "password" ? "text" : "password";
      });
    });

    $("#logoutBtn").addEventListener("click", handleLogout);
    $("#confirmYes").addEventListener("click", runConfirm);

    // Navigasi
    $$("[data-page]").forEach((el) => {
      el.addEventListener("click", () => navigate(el.dataset.page));
    });

    // Sidebar mobile
    $("#sidebarToggle").addEventListener("click", openSidebar);
    $("#sidebarClose").addEventListener("click", closeSidebar);
    $("#sidebarBackdrop").addEventListener("click", closeSidebar);
    // Tutup sidebar saat ukuran layar naik ke desktop
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 992) closeSidebar();
    });

    // Pesanan
    $("#btnAddOrder").addEventListener("click", () => openOrderForm());
    $("#btnAddOrderItem").addEventListener("click", () => {
      $("#orderItemsList").insertAdjacentHTML("beforeend", orderItemRowHTML(db.items(), {}));
    });
    $("#orderItemsList").addEventListener("click", (e) => {
      const btn = e.target.closest(".order-item-remove");
      if (!btn) return;
      btn.closest(".order-item-row").remove();
      if (!$("#orderItemsList").children.length) {
        $("#orderItemsList").innerHTML = orderItemRowHTML(db.items(), {});
      }
      recalculateOrderPrice();
    });
    $("#orderForm").addEventListener("submit", saveOrder);
    $("#orderSearch").addEventListener("input", renderOrders);
    $("#orderStatusTabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-status]");
      if (!btn) return;
      orderTabStatus = btn.dataset.status;
      renderOrders();
    });
    $("#orderServiceFee").addEventListener("input", recalculateOrderPrice);
    $("#orderService").addEventListener("change", (e) => {
      const svc = db.services().find((s) => s.name === e.target.value);
      $("#orderServiceFee").value = svc ? (Number(svc.price) || 0) : 0;
      recalculateOrderPrice();
    });
    $("#orderItemsList").addEventListener("input", (e) => {
      if (e.target.matches(".order-item-select, .order-item-qty")) recalculateOrderPrice();
    });
    // Dropdown pelanggan → auto-fill
    $("#orderCustomerSelect").addEventListener("change", (e) => {
      if (e.target.value) fillOrderFormFromCustomer(e.target.value);
    });
    $("#ordersTableBody").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === "edit") openOrderForm(id);
      else if (action === "receipt") openReceipt(id);
      else if (action === "next") advanceOrder(id);
      else if (action === "delete") deleteOrder(id);
    });

    // Pelanggan
    $("#btnAddCustomer").addEventListener("click", () => openCustomerForm());
    $("#customerForm").addEventListener("submit", saveCustomer);
    $("#customerSearch").addEventListener("input", renderCustomers);
    $("#customersTableBody").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === "edit") openCustomerForm(id);
      else if (action === "delete") deleteCustomer(id);
    });

    // Barang
    $("#btnAddItem").addEventListener("click", () => openItemForm());
    $("#itemForm").addEventListener("submit", saveItem);
    $("#itemSearch").addEventListener("input", renderItems);
    $("#itemsTableBody").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === "edit") openItemForm(id);
      else if (action === "delete") deleteItem(id);
    });

    // Layanan
    $("#btnAddService").addEventListener("click", () => openServiceForm());
    $("#serviceForm").addEventListener("submit", saveService);
    $("#serviceSearch").addEventListener("input", renderServices);
    $("#servicesTableBody").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === "edit") openServiceForm(id);
      else if (action === "delete") deleteService(id);
    });

    // Laporan
    $("#btnApplyReport").addEventListener("click", renderReports);
    $("#btnResetReport").addEventListener("click", () => {
      $("#reportFrom").value = "";
      $("#reportTo").value = "";
      renderReports();
    });
    $("#btnExportPDF").addEventListener("click", exportPDF);

    // Receipt
    $("#btnPrintReceipt").addEventListener("click", printReceipt);
  }

  /* ---------------- Init ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    initAuth();
  });
})();