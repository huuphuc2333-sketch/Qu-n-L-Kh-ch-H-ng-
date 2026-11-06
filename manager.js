"use strict";

const { createClient } = supabase;

const managerDB = createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

const PAGE_SIZE = 20;

let managerPage = 1;
let managerTotal = 0;
let editingId = null;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function money(value) {
    return Number(value || 0).toLocaleString("vi-VN");
}

function parseMoney(value) {
    const number = String(value || "").replace(/[^\d]/g, "");
    return number ? Number(number) : 0;
}

function dateVN(value) {
    if (!value) return "";
    const p = value.slice(0, 10).split("-");
    return `${p[2]}/${p[1]}/${p[0]}`;
}

function message(id, value, error = false) {
    $(id).textContent = value;
    $(id).className = error ? "message error" : "message success";
}

function showManager(user) {
    $("managerLoginBox").classList.add("hidden");
    $("managerApp").classList.remove("hidden");
    loadStatistics();
    loadManagerData();
}

/* Đăng nhập và kiểm tra quyền quản lý */
$("managerLoginForm").addEventListener("submit", async event => {
    event.preventDefault();

    const button = $("managerLoginBtn");
    button.disabled = true;
    button.textContent = "ĐANG KIỂM TRA...";

    try {
        const { data, error } = await managerDB.auth.signInWithPassword({
            email: $("managerEmail").value.trim(),
            password: $("managerPassword").value
        });

        if (error) throw error;

        const { data: isManager, error: roleError } =
            await managerDB.rpc("is_manager");

        if (roleError) throw roleError;

        if (isManager !== true) {
            await managerDB.auth.signOut();
            throw new Error("Tài khoản này không có quyền quản lý.");
        }

        showManager(data.user);

    } catch (error) {
        message("managerLoginMessage", error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = "ĐĂNG NHẬP";
    }
});

async function initManagerAuth() {
    const { data, error } = await managerDB.auth.getSession();

    if (error || !data.session) return;

    const { data: isManager, error: roleError } =
        await managerDB.rpc("is_manager");

    if (roleError || isManager !== true) {
        await managerDB.auth.signOut();
        message("managerLoginMessage", "Tài khoản không có quyền quản lý.", true);
        return;
    }

    showManager(data.session.user);
}

$("managerLogoutBtn").addEventListener("click", async () => {
    await managerDB.auth.signOut();
    location.reload();
});

/* Định dạng tiền */
document.querySelectorAll(".money-input").forEach(input => {
    input.addEventListener("input", () => {
        const value = parseMoney(input.value);
        input.value = value ? money(value) : "";
    });
});

/* Xây dựng truy vấn */
function managerQuery() {
    let query = managerDB
        .from("khach_hang_xlno")
        .select("*", { count: "exact" });

    const search = $("managerSearch").value.trim();

    if (search) {
        const safe = search.replace(/[,%_()\\]/g, " ");
        query = query.or(`cif.ilike.%${safe}%,ten_kh.ilike.%${safe}%`);
    }

    if ($("managerStage").value) {
        query = query.eq("giai_doan", $("managerStage").value);
    }

    if ($("managerDate").value) {
        query = query.eq("ngay_thuc_hien", $("managerDate").value);
    }

    return query;
}

/* Tải toàn bộ dữ liệu theo từng lô */
async function fetchAllRows(queryBuilder) {
    const allRows = [];
    const batchSize = 1000;

    for (let from = 0; ; from += batchSize) {
        const { data, error } = await queryBuilder
            .range(from, from + batchSize - 1);

        if (error) throw error;

        allRows.push(...(data || []));

        if (!data || data.length < batchSize) break;
    }

    return allRows;
}

/* Thống kê tổng quan */
async function loadStatistics() {
    try {
        const rows = await fetchAllRows(
            managerDB
                .from("khach_hang_xlno")
                .select("tong_du_no,giai_doan")
                .order("id", { ascending: true })
        );

        const totalDebt = rows.reduce(
            (sum, row) => sum + Number(row.tong_du_no || 0), 0
        );

        $("totalCustomers").textContent = rows.length.toLocaleString("vi-VN");
        $("totalDebt").textContent = money(totalDebt) + " VNĐ";

        $("countKhoiKien").textContent =
            rows.filter(r => r.giai_doan === "Đã khởi kiện").length;

        $("countThuLy").textContent =
            rows.filter(r => r.giai_doan === "Đã thụ lý").length;

        $("countTHA").textContent =
            rows.filter(r => r.giai_doan === "Thi hành án").length;

        $("countTatToan").textContent =
            rows.filter(r => r.giai_doan === "Đã tất toán").length;

    } catch (error) {
        console.error("Lỗi thống kê:", error);
    }
}

/* Tải danh sách theo trang */
async function loadManagerData() {
    const tbody = $("managerTableBody");
    tbody.innerHTML = `<tr><td colspan="11" class="empty">Đang tải...</td></tr>`;

    try {
        const from = (managerPage - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, count, error } = await managerQuery()
            .order("ngay_thuc_hien", { ascending: false })
            .order("created_at", { ascending: false })
            .range(from, to);

        if (error) throw error;

        managerTotal = count || 0;

        $("managerRecordCount").textContent =
            `Tổng cộng ${managerTotal.toLocaleString("vi-VN")} khách hàng`;

        if (!data || data.length === 0) {
            tbody.innerHTML =
                `<tr><td colspan="11" class="empty">Không có dữ liệu.</td></tr>`;
        } else {
            tbody.innerHTML = data.map(row => `
                <tr>
                    <td>${escapeHTML(row.cif)}</td>
                    <td>${escapeHTML(row.ten_kh)}</td>
                    <td>${escapeHTML(row.dia_chi)}</td>
                    <td class="number">${money(row.tong_du_no)}</td>
                    <td class="number">${money(row.goc)}</td>
                    <td class="number">${money(row.lai)}</td>
                    <td>${escapeHTML(row.tai_san_bao_dam)}</td>
                    <td>${escapeHTML(row.giai_doan)}</td>
                    <td>${dateVN(row.ngay_thuc_hien)}</td>
                    <td>${dateVN(row.created_at)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-small btn-primary"
                                data-action="edit" data-id="${escapeHTML(row.id)}">
                                Sửa
                            </button>
                            <button class="btn-small btn-danger"
                                data-action="delete" data-id="${escapeHTML(row.id)}">
                                Xóa
                            </button>
                        </div>
                    </td>
                </tr>
            `).join("");
        }

        updateManagerPagination();

    } catch (error) {
        tbody.innerHTML = `
            <tr><td colspan="11" class="empty">
                Lỗi: ${escapeHTML(error.message)}
            </td></tr>`;
    }
}

function updateManagerPagination() {
    const totalPages = Math.max(1, Math.ceil(managerTotal / PAGE_SIZE));

    $("managerPageInfo").textContent =
        `Trang ${managerPage}/${totalPages}`;

    $("managerPrev").disabled = managerPage <= 1;
    $("managerNext").disabled = managerPage >= totalPages;
}

/* Nút sửa và xóa */
$("managerTableBody").addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === "edit") {
        await editCustomer(id);
    }

    if (action === "delete") {
        await deleteCustomer(id);
    }
});

/* Lấy dữ liệu để sửa */
async function editCustomer(id) {
    try {
        const { data, error } = await managerDB
            .from("khach_hang_xlno")
            .select("*")
            .eq("id", id)
            .single();

        if (error) throw error;

        editingId = id;

        $("editId").value = data.id;
        $("editCif").value = data.cif || "";
        $("editTen").value = data.ten_kh || "";
        $("editDiaChi").value = data.dia_chi || "";
        $("editTongDuNo").value = money(data.tong_du_no);
        $("editGoc").value = money(data.goc);
        $("editLai").value = money(data.lai);
        $("editTaiSan").value = data.tai_san_bao_dam || "";
        $("editGiaiDoan").value = data.giai_doan;
        $("editNgay").value = data.ngay_thuc_hien;

        $("editMessage").textContent = "";
        $("editPanel").classList.remove("hidden");

        $("editPanel").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    } catch (error) {
        alert("Không thể tải thông tin: " + error.message);
    }
}

/* Cập nhật */
$("editForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!editingId) return;

    const button = $("updateBtn");
    button.disabled = true;
    button.textContent = "ĐANG CẬP NHẬT...";

    try {
        const payload = {
            cif: $("editCif").value.trim(),
            ten_kh: $("editTen").value.trim(),
            dia_chi: $("editDiaChi").value.trim(),
            tong_du_no: parseMoney($("editTongDuNo").value),
            goc: parseMoney($("editGoc").value),
            lai: parseMoney($("editLai").value),
            tai_san_bao_dam: $("editTaiSan").value.trim(),
            giai_doan: $("editGiaiDoan").value,
            ngay_thuc_hien: $("editNgay").value
        };

        if (!payload.cif || !payload.ten_kh || !payload.ngay_thuc_hien) {
            throw new Error("Vui lòng nhập đầy đủ các trường bắt buộc.");
        }

        const { error } = await managerDB
            .from("khach_hang_xlno")
            .update(payload)
            .eq("id", editingId);

        if (error) throw error;

        message("editMessage", "Cập nhật thành công.");

        editingId = null;
        $("editPanel").classList.add("hidden");

        await loadManagerData();
        await loadStatistics();

    } catch (error) {
        message("editMessage", error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = "CẬP NHẬT";
    }
});

/* Xóa khách hàng */
async function deleteCustomer(id) {
    const confirmed = confirm(
        "Bạn có chắc chắn muốn xóa khách hàng này không? Thao tác không thể hoàn tác."
    );

    if (!confirmed) return;

    try {
        const { error } = await managerDB
            .from("khach_hang_xlno")
            .delete()
            .eq("id", id);

        if (error) throw error;

        alert("Đã xóa khách hàng.");

        const maxPage = Math.max(1, Math.ceil((managerTotal - 1) / PAGE_SIZE));
        if (managerPage > maxPage) managerPage = maxPage;

        await loadManagerData();
        await loadStatistics();

    } catch (error) {
        alert("Không thể xóa: " + error.message);
    }
}

/* Đóng khu vực sửa */
function closeEdit() {
    editingId = null;
    $("editPanel").classList.add("hidden");
    $("editForm").reset();
}

$("closeEditBtn").addEventListener("click", closeEdit);
$("cancelEditBtn").addEventListener("click", closeEdit);

/* Bộ lọc */
let managerSearchTimer;

$("managerSearch").addEventListener("input", () => {
    clearTimeout(managerSearchTimer);

    managerSearchTimer = setTimeout(() => {
        managerPage = 1;
        loadManagerData();
    }, 350);
});

$("managerStage").addEventListener("change", () => {
    managerPage = 1;
    loadManagerData();
});

$("managerDate").addEventListener("change", () => {
    managerPage = 1;
    loadManagerData();
});

$("managerClearFilter").addEventListener("click", () => {
    $("managerSearch").value = "";
    $("managerStage").value = "";
    $("managerDate").value = "";

    managerPage = 1;
    loadManagerData();
});

/* Phân trang */
$("managerPrev").addEventListener("click", () => {
    if (managerPage > 1) {
        managerPage--;
        loadManagerData();
    }
});

$("managerNext").addEventListener("click", () => {
    const totalPages = Math.ceil(managerTotal / PAGE_SIZE);

    if (managerPage < totalPages) {
        managerPage++;
        loadManagerData();
    }
});

/* Xuất Excel toàn bộ kết quả đang lọc */
$("exportBtn").addEventListener("click", async () => {
    const button = $("exportBtn");
    button.disabled = true;
    button.textContent = "ĐANG XUẤT...";

    try {
        const rows = await fetchAllRows(
            managerQuery()
                .order("ngay_thuc_hien", { ascending: false })
                .order("created_at", { ascending: false })
        );

        if (rows.length === 0) {
            alert("Không có dữ liệu để xuất.");
            return;
        }

        const excelData = rows.map(row => ({
            "CIF": row.cif,
            "Tên khách hàng": row.ten_kh,
            "Địa chỉ": row.dia_chi,
            "Tổng dư nợ": Number(row.tong_du_no || 0),
            "Gốc": Number(row.goc || 0),
            "Lãi": Number(row.lai || 0),
            "Tài sản bảo đảm": row.tai_san_bao_dam,
            "Giai đoạn xử lý": row.giai_doan,
            "Ngày thực hiện": dateVN(row.ngay_thuc_hien),
            "Ngày tạo": dateVN(row.created_at)
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);

        worksheet["!cols"] = [
            { wch: 18 }, { wch: 28 }, { wch: 35 },
            { wch: 20 }, { wch: 20 }, { wch: 20 },
            { wch: 35 }, { wch: 20 }, { wch: 18 }, { wch: 18 }
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Khach Hang XLN");

        const now = new Date();
        const date = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0")
        ].join("");

        XLSX.writeFile(workbook, `Bao_cao_khach_hang_XLN_${date}.xlsx`);

        alert(`Đã xuất ${rows.length} khách hàng.`);

    } catch (error) {
        alert("Lỗi xuất Excel: " + error.message);
    } finally {
        button.disabled = false;
        button.textContent = "XUẤT EXCEL";
    }
});

managerDB.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
        $("managerApp").classList.add("hidden");
        $("managerLoginBox").classList.remove("hidden");
    }
});

initManagerAuth();
