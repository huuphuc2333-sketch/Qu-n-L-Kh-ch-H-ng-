"use strict";

const { createClient } = supabase;

const db = createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

const PAGE_SIZE = 20;

let currentPage = 1;
let totalRecords = 0;
let currentUser = null;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString("vi-VN");
}

function parseMoney(value) {
    const number = String(value || "").replace(/[^\d]/g, "");
    return number ? Number(number) : 0;
}

function formatDate(value) {
    if (!value) return "";
    const parts = value.slice(0, 10).split("-");
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function todayVietnam() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const get = type => parts.find(p => p.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
}

function showMessage(id, message, isError = false) {
    const element = $(id);
    element.textContent = message;
    element.className = isError ? "message error" : "message success";
}

function setLoggedIn(user) {
    currentUser = user;
    $("loginBox").classList.add("hidden");
    $("appBox").classList.remove("hidden");
    $("ngay_thuc_hien").value = todayVietnam();
    loadData();
}

async function initAuth() {
    const { data, error } = await db.auth.getSession();

    if (error) {
        showMessage("loginMessage", error.message, true);
        return;
    }

    if (data.session) {
        setLoggedIn(data.session.user);
    }
}

$("loginForm").addEventListener("submit", async event => {
    event.preventDefault();

    const button = event.submitter;
    button.disabled = true;
    button.textContent = "ĐANG ĐĂNG NHẬP...";

    try {
        const { data, error } = await db.auth.signInWithPassword({
            email: $("email").value.trim(),
            password: $("password").value
        });

        if (error) throw error;

        setLoggedIn(data.user);
    } catch (error) {
        showMessage("loginMessage", error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = "ĐĂNG NHẬP";
    }
});

$("logoutBtn").addEventListener("click", async () => {
    await db.auth.signOut();
    location.reload();
});

/* Định dạng tiền khi nhập */
document.querySelectorAll(".money-input").forEach(input => {
    input.addEventListener("input", () => {
        const number = parseMoney(input.value);
        input.value = number ? formatMoney(number) : "";
    });
});

/* Làm mới form */
$("customerForm").addEventListener("reset", () => {
    setTimeout(() => {
        $("ngay_thuc_hien").value = todayVietnam();
    }, 0);
});

/* Lưu khách hàng mới */
$("customerForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) {
        showMessage("formMessage", "Phiên đăng nhập không hợp lệ.", true);
        return;
    }

    const button = $("saveBtn");
    button.disabled = true;
    button.textContent = "ĐANG LƯU...";

    try {
        const cif = $("cif").value.trim();

        if (!cif) throw new Error("Vui lòng nhập số CIF.");

        const payload = {
            cif,
            ten_kh: $("ten_kh").value.trim(),
            dia_chi: $("dia_chi").value.trim(),
            tong_du_no: parseMoney($("tong_du_no").value),
            goc: parseMoney($("goc").value),
            lai: parseMoney($("lai").value),
            tai_san_bao_dam: $("tai_san_bao_dam").value.trim(),
            giai_doan: $("giai_doan").value,
            ngay_thuc_hien: $("ngay_thuc_hien").value,
            created_by: currentUser.id
        };

        if (!payload.ten_kh) {
            throw new Error("Vui lòng nhập tên khách hàng.");
        }

        if (!payload.giai_doan) {
            throw new Error("Vui lòng chọn giai đoạn xử lý.");
        }

        const { error } = await db
            .from("khach_hang_xlno")
            .insert(payload);

        if (error) throw error;

        showMessage("formMessage", "Đã lưu thông tin khách hàng thành công.");

        $("customerForm").reset();
        currentPage = 1;
        await loadData();

    } catch (error) {
        showMessage("formMessage", error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = "LƯU THÔNG TIN";
    }
});

/* Tạo truy vấn lọc */
function buildQuery() {
    let query = db
        .from("khach_hang_xlno")
        .select("*", { count: "exact" });

    const search = $("searchInput").value.trim();

    if (search) {
        const safe = search.replace(/[,%_()\\]/g, " ");
        query = query.or(`cif.ilike.%${safe}%,ten_kh.ilike.%${safe}%`);
    }

    if ($("stageFilter").value) {
        query = query.eq("giai_doan", $("stageFilter").value);
    }

    if ($("dateFilter").value) {
        query = query.eq("ngay_thuc_hien", $("dateFilter").value);
    }

    return query;
}

/* Tải danh sách */
async function loadData() {
    const tbody = $("customerTableBody");
    tbody.innerHTML = `<tr><td colspan="9" class="empty">Đang tải...</td></tr>`;

    try {
        const from = (currentPage - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, count, error } = await buildQuery()
            .order("ngay_thuc_hien", { ascending: false })
            .order("created_at", { ascending: false })
            .range(from, to);

        if (error) throw error;

        totalRecords = count || 0;
        $("recordCount").textContent = `Tổng cộng ${totalRecords} khách hàng`;

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="empty">Không có dữ liệu.</td></tr>`;
        } else {
            tbody.innerHTML = data.map(row => `
                <tr>
                    <td>${escapeHTML(row.cif)}</td>
                    <td>${escapeHTML(row.ten_kh)}</td>
                    <td>${escapeHTML(row.dia_chi)}</td>
                    <td class="number">${formatMoney(row.tong_du_no)}</td>
                    <td class="number">${formatMoney(row.goc)}</td>
                    <td class="number">${formatMoney(row.lai)}</td>
                    <td>${escapeHTML(row.tai_san_bao_dam)}</td>
                    <td>${escapeHTML(row.giai_doan)}</td>
                    <td>${formatDate(row.ngay_thuc_hien)}</td>
                </tr>
            `).join("");
        }

        updatePagination();

    } catch (error) {
        tbody.innerHTML = `
            <tr><td colspan="9" class="empty">
                Lỗi tải dữ liệu: ${escapeHTML(error.message)}
            </td></tr>`;
    }
}

function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));

    $("pageInfo").textContent = `Trang ${currentPage}/${totalPages}`;
    $("prevBtn").disabled = currentPage <= 1;
    $("nextBtn").disabled = currentPage >= totalPages;
}

$("prevBtn").addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        loadData();
    }
});

$("nextBtn").addEventListener("click", () => {
    const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
    if (currentPage < totalPages) {
        currentPage++;
        loadData();
    }
});

let searchTimer;

$("searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        currentPage = 1;
        loadData();
    }, 350);
});

$("stageFilter").addEventListener("change", () => {
    currentPage = 1;
    loadData();
});

$("dateFilter").addEventListener("change", () => {
    currentPage = 1;
    loadData();
});

$("clearFilterBtn").addEventListener("click", () => {
    $("searchInput").value = "";
    $("stageFilter").value = "";
    $("dateFilter").value = "";
    currentPage = 1;
    loadData();
});

db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
        currentUser = null;
        $("appBox").classList.add("hidden");
        $("loginBox").classList.remove("hidden");
    }
});

initAuth();
