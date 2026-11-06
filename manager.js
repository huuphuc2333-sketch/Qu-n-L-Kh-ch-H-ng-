
"use strict";

/* =========================================================
   QUẢN LÝ KHÁCH HÀNG XLN
   SUPABASE AUTH - KHÔNG DÙNG RPC / USER_ROLES
   ========================================================= */

/* 1. KẾT NỐI SUPABASE */

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
let managerSearchTimer = null;


/* 2. HÀM HỖ TRỢ */

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

    const date = String(value).slice(0, 10);
    const parts = date.split("-");

    if (parts.length !== 3) return date;

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function message(id, value, error = false) {
    const element = $(id);

    if (!element) return;

    element.textContent = value;
    element.className = error
        ? "message error"
        : "message success";
}

function showManager(user) {
    $("managerLoginBox").classList.add("hidden");
    $("managerApp").classList.remove("hidden");

    managerPage = 1;

    console.log("Đã đăng nhập quản lý:", user.email);

    loadStatistics();
    loadManagerData();
}


/* =========================================================
   3. ĐĂNG NHẬP SUPABASE AUTH
   ========================================================= */

/*
   Chỉ kiểm tra tài khoản có đăng nhập thành công
   bằng Supabase Authentication hay không.

   Không gọi:
   - is_manager()
   - user_roles
   - RPC
*/

$("managerLoginForm").addEventListener("submit", async event => {
    event.preventDefault();

    const button = $("managerLoginBtn");

    button.disabled = true;
    button.textContent = "ĐANG ĐĂNG NHẬP...";

    message("managerLoginMessage", "");

    try {
        const email = $("managerEmail").value.trim();
        const password = $("managerPassword").value;

        if (!email || !password) {
            throw new Error("Vui lòng nhập Email và mật khẩu.");
        }

        const { data, error } = await managerDB.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        if (!data.user) {
            throw new Error("Không xác thực được tài khoản.");
        }

        showManager(data.user);

    } catch (error) {
        console.error("Lỗi đăng nhập:", error);

        message(
            "managerLoginMessage",
            error.message || "Đăng nhập thất bại.",
            true
        );

    } finally {
        button.disabled = false;
        button.textContent = "ĐĂNG NHẬP";
    }
});


/* =========================================================
   4. KIỂM TRA PHIÊN ĐĂNG NHẬP
   ========================================================= */

async function initManagerAuth() {
    try {
        const { data, error } = await managerDB.auth.getSession();

        if (error) throw error;

        if (!data.session) {
            $("managerLoginBox").classList.remove("hidden");
            $("managerApp").classList.add("hidden");
            return;
        }

        showManager(data.session.user);

    } catch (error) {
        console.error("Lỗi kiểm tra phiên:", error);

        message(
            "managerLoginMessage",
            "Không thể kiểm tra phiên đăng nhập: " + error.message,
            true
        );
    }
}


/* =========================================================
   5. ĐĂNG XUẤT
   ========================================================= */

$("managerLogoutBtn").addEventListener("click", async () => {
    const confirmed = confirm("Bạn có chắc chắn muốn đăng xuất?");

    if (!confirmed) return;

    try {
        const { error } = await managerDB.auth.signOut();

        if (error) throw error;

        location.reload();

    } catch (error) {
        alert("Lỗi đăng xuất: " + error.message);
    }
});


/* =========================================================
   6. ĐỊNH DẠNG Ô NHẬP TIỀN
   ========================================================= */

document.querySelectorAll(".money-input").forEach(input => {

    input.addEventListener("input", () => {

        const value = parseMoney(input.value);

        input.value = value ? money(value) : "";

    });

});


/* =========================================================
   7. XÂY DỰNG TRUY VẤN DỮ LIỆU
   ========================================================= */

function managerQuery() {

    let query = managerDB
        .from("khach_hang_xlno")
        .select("*", { count: "exact" });

    const search = $("managerSearch").value.trim();

    if (search) {

        const safe = search.replace(/[,%_()\\]/g, " ");

        query = query.or(
            `cif.ilike.%${safe}%,ten_kh.ilike.%${safe}%`
        );

    }

    const stage = $("managerStage").value;

    if (stage) {
        query = query.eq("giai_doan", stage);
    }

    const date = $("managerDate").value;

    if (date) {
        query = query.eq("ngay_thuc_hien", date);
    }

    return query;
}


/* =========================================================
   8. TẢI TOÀN BỘ DỮ LIỆU THEO TỪNG LÔ
   ========================================================= */

async function fetchAllRows(queryBuilder) {

    const allRows = [];
    const batchSize = 1000;

    for (let from = 0; ; from += batchSize) {

        const { data, error } = await queryBuilder
            .range(from, from + batchSize - 1);

        if (error) throw error;

        allRows.push(...(data || []));

        if (!data || data.length < batchSize) {
            break;
        }
    }

    return allRows;
}


/* =========================================================
   9. THỐNG KÊ TỔNG QUAN
   ========================================================= */

async function loadStatistics() {

    try {

        const rows = await fetchAllRows(

            managerDB
                .from("khach_hang_xlno")
                .select("tong_du_no,giai_doan")
                .order("id", { ascending: true })

        );

        const totalDebt = rows.reduce(
            (sum, row) => sum + Number(row.tong_du_no || 0),
            0
        );

        $("totalCustomers").textContent =
            rows.length.toLocaleString("vi-VN");

        $("totalDebt").textContent =
            money(totalDebt) + " VNĐ";

        $("countKhoiKien").textContent =
            rows.filter(row =>
                row.giai_doan === "Đã khởi kiện"
            ).length.toLocaleString("vi-VN");

        $("countThuLy").textContent =
            rows.filter(row =>
                row.giai_doan === "Đã thụ lý"
            ).length.toLocaleString("vi-VN");

        $("countTHA").textContent =
            rows.filter(row =>
                row.giai_doan === "Thi hành án"
            ).length.toLocaleString("vi-VN");

        $("countTatToan").textContent =
            rows.filter(row =>
                row.giai_doan === "Đã tất toán"
            ).length.toLocaleString("vi-VN");

    } catch (error) {

        console.error("Lỗi thống kê:", error);

    }

}


/* =========================================================
   10. TẢI DANH SÁCH KHÁCH HÀNG
   ========================================================= */

async function loadManagerData() {

    const tbody = $("managerTableBody");

    tbody.innerHTML = `
        <tr>
            <td colspan="11" class="empty">
                Đang tải dữ liệu...
            </td>
        </tr>
    `;

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

            tbody.innerHTML = `
                <tr>
                    <td colspan="11" class="empty">
                        Không có dữ liệu.
                    </td>
                </tr>
            `;

        } else {

            tbody.innerHTML = data.map(row => `

                <tr>

                    <td>${escapeHTML(row.cif)}</td>

                    <td>${escapeHTML(row.ten_kh)}</td>

                    <td>${escapeHTML(row.dia_chi)}</td>

                    <td class="number">
                        ${money(row.tong_du_no)}
                    </td>

                    <td class="number">
                        ${money(row.goc)}
                    </td>

                    <td class="number">
                        ${money(row.lai)}
                    </td>

                    <td>
                        ${escapeHTML(row.tai_san_bao_dam)}
                    </td>

                    <td>
                        ${escapeHTML(row.giai_doan)}
                    </td>

                    <td>
                        ${dateVN(row.ngay_thuc_hien)}
                    </td>

                    <td>
                        ${dateVN(row.created_at)}
                    </td>

                    <td>

                        <div class="action-buttons">

                            <button
                                class="btn-small btn-primary"
                                data-action="edit"
                                data-id="${escapeHTML(row.id)}">

                                Sửa

                            </button>

                            <button
                                class="btn-small btn-danger"
                                data-action="delete"
                                data-id="${escapeHTML(row.id)}">

                                Xóa

                            </button>

                        </div>

                    </td>

                </tr>

            `).join("");

        }

        updateManagerPagination();

    } catch (error) {

        console.error("Lỗi tải dữ liệu:", error);

        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="empty">
                    Lỗi: ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

    }

}


/* =========================================================
   11. PHÂN TRANG
   ========================================================= */

function updateManagerPagination() {

    const totalPages = Math.max(
        1,
        Math.ceil(managerTotal / PAGE_SIZE)
    );

    $("managerPageInfo").textContent =
        `Trang ${managerPage}/${totalPages}`;

    $("managerPrev").disabled =
        managerPage <= 1;

    $("managerNext").disabled =
        managerPage >= totalPages;

}


/* =========================================================
   12. SỰ KIỆN SỬA VÀ XÓA
   ========================================================= */

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


/* =========================================================
   13. LẤY THÔNG TIN KHÁCH HÀNG ĐỂ SỬA
   ========================================================= */

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

        $("editCif").value =
            data.cif || "";

        $("editTen").value =
            data.ten_kh || "";

        $("editDiaChi").value =
            data.dia_chi || "";

        $("editTongDuNo").value =
            money(data.tong_du_no);

        $("editGoc").value =
            money(data.goc);

        $("editLai").value =
            money(data.lai);

        $("editTaiSan").value =
            data.tai_san_bao_dam || "";

        $("editGiaiDoan").value =
            data.giai_doan || "";

        $("editNgay").value =
            data.ngay_thuc_hien || "";

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


/* =========================================================
   14. CẬP NHẬT KHÁCH HÀNG
   ========================================================= */

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

            tong_du_no: parseMoney(
                $("editTongDuNo").value
            ),

            goc: parseMoney(
                $("editGoc").value
            ),

            lai: parseMoney(
                $("editLai").value
            ),

            tai_san_bao_dam: $("editTaiSan").value.trim(),

            giai_doan: $("editGiaiDoan").value,

            ngay_thuc_hien: $("editNgay").value

        };

        if (
            !payload.cif ||
            !payload.ten_kh ||
            !payload.ngay_thuc_hien
        ) {

            throw new Error(
                "Vui lòng nhập đầy đủ các trường bắt buộc."
            );

        }

        const { data, error } = await managerDB
            .from("khach_hang_xlno")
            .update(payload)
            .eq("id", editingId)
            .select("id");

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error(
                "Không cập nhật được dữ liệu. Hãy kiểm tra quyền RLS."
            );
        }

        message(
            "editMessage",
            "Cập nhật khách hàng thành công."
        );

        editingId = null;

        $("editPanel").classList.add("hidden");

        await loadManagerData();

        await loadStatistics();

    } catch (error) {

        message(
            "editMessage",
            error.message,
            true
        );

    } finally {

        button.disabled = false;
        button.textContent = "CẬP NHẬT";

    }

});


/* =========================================================
   15. XÓA KHÁCH HÀNG
   ========================================================= */

async function deleteCustomer(id) {

    const confirmed = confirm(
        "Bạn có chắc chắn muốn xóa khách hàng này không?\n\n" +
        "Thao tác này không thể hoàn tác."
    );

    if (!confirmed) return;

    try {

        const { data, error } = await managerDB
            .from("khach_hang_xlno")
            .delete()
            .eq("id", id)
            .select("id");

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error(
                "Không xóa được dữ liệu. Hãy kiểm tra quyền RLS."
            );
        }

        alert("Đã xóa khách hàng thành công.");

        const maxPage = Math.max(
            1,
            Math.ceil((managerTotal - 1) / PAGE_SIZE)
        );

        if (managerPage > maxPage) {
            managerPage = maxPage;
        }

        await loadManagerData();

        await loadStatistics();

    } catch (error) {

        alert("Không thể xóa: " + error.message);

    }

}


/* =========================================================
   16. ĐÓNG KHU VỰC CHỈNH SỬA
   ========================================================= */

function closeEdit() {

    editingId = null;

    $("editPanel").classList.add("hidden");

    $("editForm").reset();

    $("editMessage").textContent = "";

}

$("closeEditBtn").addEventListener(
    "click",
    closeEdit
);

$("cancelEditBtn").addEventListener(
    "click",
    closeEdit
);


/* =========================================================
   17. TÌM KIẾM KHÁCH HÀNG
   ========================================================= */

$("managerSearch").addEventListener("input", () => {

    clearTimeout(managerSearchTimer);

    managerSearchTimer = setTimeout(() => {

        managerPage = 1;

        loadManagerData();

    }, 350);

});


/* =========================================================
   18. LỌC GIAI ĐOẠN
   ========================================================= */

$("managerStage").addEventListener("change", () => {

    managerPage = 1;

    loadManagerData();

});


/* =========================================================
   19. LỌC NGÀY THỰC HIỆN
   ========================================================= */

$("managerDate").addEventListener("change", () => {

    managerPage = 1;

    loadManagerData();

});


/* =========================================================
   20. XÓA BỘ LỌC
   ========================================================= */

$("managerClearFilter").addEventListener("click", () => {

    $("managerSearch").value = "";

    $("managerStage").value = "";

    $("managerDate").value = "";

    managerPage = 1;

    loadManagerData();

});


/* =========================================================
   21. PHÂN TRANG TRƯỚC / SAU
   ========================================================= */

$("managerPrev").addEventListener("click", () => {

    if (managerPage > 1) {

        managerPage--;

        loadManagerData();

    }

});


$("managerNext").addEventListener("click", () => {

    const totalPages = Math.ceil(
        managerTotal / PAGE_SIZE
    );

    if (managerPage < totalPages) {

        managerPage++;

        loadManagerData();

    }

});


/* =========================================================
   22. XUẤT EXCEL TOÀN BỘ KẾT QUẢ ĐANG LỌC
   ========================================================= */

$("exportBtn").addEventListener("click", async () => {

    const button = $("exportBtn");

    button.disabled = true;
    button.textContent = "ĐANG XUẤT...";

    try {

        if (typeof XLSX === "undefined") {

            throw new Error(
                "Chưa tải thư viện SheetJS (XLSX)."
            );

        }

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

        const worksheet =
            XLSX.utils.json_to_sheet(excelData);

        worksheet["!cols"] = [

            { wch: 18 },
            { wch: 28 },
            { wch: 35 },
            { wch: 20 },
            { wch: 20 },
            { wch: 20 },
            { wch: 35 },
            { wch: 20 },
            { wch: 18 },
            { wch: 18 }

        ];

        const workbook =
            XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Khach Hang XLN"
        );

        const now = new Date();

        const date = [

            now.getFullYear(),

            String(now.getMonth() + 1).padStart(2, "0"),

            String(now.getDate()).padStart(2, "0")

        ].join("");

        XLSX.writeFile(
            workbook,
            `Bao_cao_khach_hang_XLN_${date}.xlsx`
        );

        alert(
            `Đã xuất thành công ${rows.length} khách hàng.`
        );

    } catch (error) {

        console.error("Lỗi xuất Excel:", error);

        alert(
            "Lỗi xuất Excel: " + error.message
        );

    } finally {

        button.disabled = false;

        button.textContent = "XUẤT EXCEL";

    }

});


/* =========================================================
   23. THEO DÕI TRẠNG THÁI AUTH
   ========================================================= */

managerDB.auth.onAuthStateChange((event, session) => {

    if (event === "SIGNED_OUT") {

        $("managerApp").classList.add("hidden");

        $("managerLoginBox").classList.remove("hidden");

        $("managerPassword").value = "";

        managerPage = 1;

    }

});


/* =========================================================
   24. KHỞI ĐỘNG HỆ THỐNG
   ========================================================= */

initManagerAuth();
