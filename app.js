
"use strict";

const { createClient } = supabase;

const db = createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

/* Định dạng tiền */
function formatMoney(value) {
    return Number(value || 0).toLocaleString("vi-VN");
}

function parseMoney(value) {
    const number = String(value || "").replace(/[^\d]/g, "");
    return number ? Number(number) : 0;
}

/* Ngày Việt Nam */
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

/* Hiển thị thông báo */
function showMessage(message, isError = false) {
    const element = $("formMessage");

    element.textContent = message;
    element.className = isError
        ? "message error"
        : "message success";
}

/* Khởi tạo trang nhập liệu */
function initPage() {
    $("ngay_thuc_hien").value = todayVietnam();

    // Định dạng tiền khi nhập
    document.querySelectorAll(".money-input").forEach(input => {
        input.addEventListener("input", () => {
            const number = parseMoney(input.value);
            input.value = number ? formatMoney(number) : "";
        });
    });

    // Làm mới biểu mẫu
    $("customerForm").addEventListener("reset", () => {
        setTimeout(() => {
            $("ngay_thuc_hien").value = todayVietnam();
            showMessage("");
        }, 0);
    });

    // Lưu khách hàng
    $("customerForm").addEventListener("submit", saveCustomer);
}

/* Gửi dữ liệu lên Supabase */
async function saveCustomer(event) {
    event.preventDefault();

    const button = $("saveBtn");

    button.disabled = true;
    button.textContent = "ĐANG LƯU...";

    showMessage("");

    try {
        const payload = {
            user_name: $("user_name").value.trim().toUpperCase(),
            cif: $("cif").value.trim(),
            ten_kh: $("ten_kh").value.trim(),
            dia_chi: $("dia_chi").value.trim(),
            tong_du_no: parseMoney($("tong_du_no").value),
            goc: parseMoney($("goc").value),
            lai: parseMoney($("lai").value),
            tai_san_bao_dam: $("tai_san_bao_dam").value.trim(),
            giai_doan: $("giai_doan").value,
            ngay_thuc_hien: $("ngay_thuc_hien").value
        };

        // Kiểm tra dữ liệu
        if (!payload.user_name) {
            throw new Error("Vui lòng nhập USER cán bộ.");
        }

        if (!payload.cif) {
            throw new Error("Vui lòng nhập số CIF.");
        }

        if (!payload.ten_kh) {
            throw new Error("Vui lòng nhập tên khách hàng.");
        }

        if (!payload.giai_doan) {
            throw new Error("Vui lòng chọn giai đoạn xử lý.");
        }

        if (!payload.ngay_thuc_hien) {
            throw new Error("Vui lòng chọn ngày thực hiện.");
        }

        const validStages = [
            "Đã khởi kiện",
            "Đã thụ lý",
            "Thi hành án",
            "Đã tất toán"
        ];

        if (!validStages.includes(payload.giai_doan)) {
            throw new Error("Giai đoạn xử lý không hợp lệ.");
        }

        // Thêm dữ liệu vào bảng Supabase
        const { error } = await db
            .from("khach_hang_xlno")
            .insert([payload]);

        if (error) throw error;

        showMessage("ĐÃ LƯU THÔNG TIN KHÁCH HÀNG THÀNH CÔNG!");

        // Giữ lại USER để cán bộ nhập hồ sơ tiếp theo
        const savedUser = payload.user_name;

        $("customerForm").reset();

        $("user_name").value = savedUser;
        $("ngay_thuc_hien").value = todayVietnam();

        $("cif").focus();

    } catch (error) {
        console.error("Lỗi lưu dữ liệu:", error);

        showMessage(
            "KHÔNG LƯU ĐƯỢC DỮ LIỆU: " + error.message,
            true
        );

    } finally {
        button.disabled = false;
        button.textContent = "LƯU THÔNG TIN";
    }
}

/* Chạy trang */
initPage();
