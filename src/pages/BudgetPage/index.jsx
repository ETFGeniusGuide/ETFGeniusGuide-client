// src/pages/BudgetPage.jsx
import React, { useMemo, useState } from "react";
import dayjs from "dayjs";
import axios from "axios";
import {
    QueryClient,
    QueryClientProvider,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { create } from "zustand";

/* ============ 환경설정 ============ */
const BASE_URL = "http://localhost:8080";

/* ============ Axios ============ */
const api = axios.create({
    baseURL: BASE_URL,
    headers: { "Content-Type": "application/json" },
});

/* ============ Zustand ============ */
const useBudgetStore = create((set, get) => ({
    yearMonth: dayjs().format("YYYY-MM"),
    selectedDate: dayjs().format("YYYY-MM-DD"),
    localSpends: [],
    setYearMonth: (ym) =>
        set({
            yearMonth: ym,
            selectedDate: dayjs(ym + "-01").format("YYYY-MM-DD"),
            localSpends: [],
        }),
    setSelectedDate: (d) => set({ selectedDate: d }),
    pushLocalSpend: (sp) => set({ localSpends: [...get().localSpends, sp] }),
    replaceLocalSpendId: (tempId, realId) =>
        set({
            localSpends: get().localSpends.map((s) => (s.id === tempId ? { ...s, id: realId } : s)),
        }),
    removeLocalSpend: (id) =>
        set({ localSpends: get().localSpends.filter((s) => s.id !== id) }),
}));

/* ============ API 래퍼 ============ */
// Plan
const apiPlanGet = async (yearMonth) => (await api.post("/api/budget/plans/get", { yearMonth })).data;
const apiPlanCreate = async ({ yearMonth, amount }) =>
    (await api.post("/api/budget/plans/create", { yearMonth, amount })).data;
const apiPlanUpdate = async ({ yearMonth, amount }) =>
    (await api.patch("/api/budget/plans/update", { yearMonth, amount })).data;

// Category
const apiCategoryList = async (includeInactive = false) =>
    (await api.post("/api/budget/categories/list", { includeInactive })).data;
const apiCategoryCreate = async ({ name }) =>
    (await api.post("/api/budget/categories/create", { name })).data;

// Spend
const apiSpendCreate = async (payload) => {
    try {
        return (await api.post("/api/budget/spends/add", payload)).data;
    } catch (e) {
        throw e;
    }
};
const apiSpendDelete = async ({ id }) =>
    (await api.post("/api/budget/spends/delete", { id })).data;
const apiSpendUpdate = async (payload) =>
    (await api.patch("/api/budget/spends/update", payload)).data;

// ✅ 새로 추가된 조회 API
const apiSpendListByDate = async ({ yearMonth, date }) =>
    (await api.post("/api/budget/spends/listByDate", { yearMonth, date })).data;

/* ============ 유틸 ============ */
const fmtKRW = (n) => (n ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 0 });

const monthDays = (yearMonth) => {
    const start = dayjs(yearMonth + "-01");
    const len = start.daysInMonth();
    const out = [];
    for (let d = 1; d <= len; d++) {
        const date = start.date(d);
        out.push({
            dateStr: date.format("YYYY-MM-DD"),
            weekday: ["일", "월", "화", "수", "목", "금", "토"][date.day()],
        });
    }
    return out;
};

const buildAllowance = ({ yearMonth, planAmount, spendsByDate }) => {
    const days = monthDays(yearMonth);
    const base = Math.floor((planAmount ?? 0) / (days.length || 1));
    let carry = 0;
    return days.map((d) => {
        const spend = spendsByDate[d.dateStr] ?? 0;
        const allowedToday = base + carry;
        const endCarry = allowedToday - spend;
        carry = endCarry;
        return { ...d, base, allowedToday, spend, endCarry };
    });
};

/* ============ 간단 모달 ============ */
const Modal = ({ open, onClose, children, title }) =>
    !open ? null : (
        <div style={S.backdrop}>
            <div style={S.modal}>
                <div style={S.modalHeader}>
                    <strong>{title}</strong>
                    <button onClick={onClose} style={S.btnGhost}>
                        ×
                    </button>
                </div>
                <div style={{ padding: 12 }}>{children}</div>
            </div>
        </div>
    );

/* ============ 페이지 ============ */
function BudgetPageInner() {
    const queryClient = useQueryClient();
    const {
        yearMonth,
        selectedDate,
        setYearMonth,
        setSelectedDate,
        localSpends,
        pushLocalSpend,
        replaceLocalSpendId,
        removeLocalSpend,
    } = useBudgetStore();

    const [planModalOpen, setPlanModalOpen] = useState(false);
    const [spendModalOpen, setSpendModalOpen] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const [planAmountInput, setPlanAmountInput] = useState("");
    const [spendInput, setSpendInput] = useState({
        date: selectedDate,
        categoryId: "",
        amount: "",
        memo: "",
    });

    const [useCustomCategory, setUseCustomCategory] = useState(false);
    const [customCategoryName, setCustomCategoryName] = useState("");
    const [categoryCreating, setCategoryCreating] = useState(false);

    // 카테고리/플랜
    const catQuery = useQuery({
        queryKey: ["categories"],
        queryFn: () => apiCategoryList(false),
    });

    const planQuery = useQuery({
        queryKey: ["plan", yearMonth],
        queryFn: () => apiPlanGet(yearMonth),
        retry: false,
    });

    // ✅ “그 날 지출 목록” (모달용)
    const dateSpendQuery = useQuery({
        queryKey: ["spendByDate", yearMonth, spendInput.date],
        queryFn: () => apiSpendListByDate({ yearMonth, date: spendInput.date }),
        enabled: spendModalOpen && !!spendInput.date, // 모달 열렸을 때만 불러옴
    });

    // 플랜 업서트
    const savePlan = useMutation({
        mutationFn: async ({ yearMonth, amount }) => {
            try {
                return await apiPlanCreate({ yearMonth, amount });
            } catch (e) {
                const msg = e?.response?.data?.message || e?.message || "";
                if (msg.includes("이미") && msg.includes("존재")) {
                    return await apiPlanUpdate({ yearMonth, amount });
                }
                if (e?.response?.status === 409) {
                    return await apiPlanUpdate({ yearMonth, amount });
                }
                throw e;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["plan", yearMonth] });
            setPlanModalOpen(false);
            setErrorMsg("");
        },
        onError: (e) => {
            setErrorMsg(e?.response?.data?.message || e?.message || "월 목표액 저장에 실패했습니다.");
        },
    });

    // 지출 추가/삭제/수정
    const addSpend = useMutation({
        mutationFn: apiSpendCreate,
        onMutate: async (payload) => {
            setErrorMsg("");
            const tempId = "tmp-" + Date.now();
            pushLocalSpend({ id: tempId, ...payload });
            return { tempId };
        },
        onSuccess: (data, _vars, ctx) => {
            if (data?.id && ctx?.tempId) replaceLocalSpendId(ctx.tempId, data.id);
            // ✅ 추가 후 “그 날 지출 목록” 갱신
            queryClient.invalidateQueries({ queryKey: ["spendByDate", yearMonth, _vars.date] });
            setSpendModalOpen(false);
        },
        onError: (e, vars, ctx) => {
            if (ctx?.tempId) removeLocalSpend(ctx.tempId);
            setErrorMsg(e?.response?.data?.message || e?.message || "지출 저장에 실패했습니다.");
            // 실패 시에도 목록 새로고침 시도(서버 기준으로 보정)
            queryClient.invalidateQueries({ queryKey: ["spendByDate", yearMonth, vars?.date] });
        },
    });

    const deleteSpend = useMutation({
        mutationFn: apiSpendDelete,
        onSuccess: (_data, vars) => {
            removeLocalSpend(vars.id); // 낙관 제거
            queryClient.invalidateQueries({ queryKey: ["spendByDate", yearMonth, spendInput.date] });
        },
    });

    const updateSpend = useMutation({
        mutationFn: apiSpendUpdate,
        onSuccess: (_d, v) => {
            queryClient.invalidateQueries({ queryKey: ["spendByDate", yearMonth, v.date] });
        },
        onError: (e) => {
            setErrorMsg(e?.response?.data?.message || e?.message || "지출 수정에 실패했습니다.");
        },
    });

    // 월 집계(화면 상단 표 계산용) — 서버 목록 API가 생겨도 합계만 쓰면 충분
    const spendsByDate = useMemo(() => {
        const map = {};
        for (const s of localSpends.filter((x) => x.yearMonth === yearMonth)) {
            map[s.date] = (map[s.date] ?? 0) + Math.round(Number(s.amount) || 0);
        }
        return map;
    }, [localSpends, yearMonth]);

    const planAmount = planQuery.data?.amount ?? 0;
    const rows = useMemo(
        () => buildAllowance({ yearMonth, planAmount, spendsByDate }),
        [yearMonth, planAmount, spendsByDate]
    );

    const onChangeMonth = (offset) =>
        setYearMonth(dayjs(yearMonth + "-01").add(offset, "month").format("YYYY-MM"));
    const selectedRow = rows.find((r) => r.dateStr === selectedDate);
    const monthLen = rows.length;

    const openSpendModalForDate = (dateStr) => {
        setSpendInput({
            date: dateStr,
            categoryId: "",
            amount: "",
            memo: "",
        });
        setUseCustomCategory(false);
        setCustomCategoryName("");
        setSpendModalOpen(true);
    };

    const handleAddCategory = async () => {
        if (!customCategoryName.trim()) return;
        try {
            setCategoryCreating(true);
            const created = await apiCategoryCreate({ name: customCategoryName.trim() });
            await queryClient.invalidateQueries({ queryKey: ["categories"] });
            const newId = created?.id ?? created?.data?.id;
            setSpendInput((s) => ({ ...s, categoryId: newId ? String(newId) : "" }));
            setCustomCategoryName("");
            setUseCustomCategory(false);
        } catch (e) {
            setErrorMsg(e?.response?.data?.message || e?.message || "카테고리 추가에 실패했습니다.");
        } finally {
            setCategoryCreating(false);
        }
    };

    return (
        <div style={S.wrap}>
            {/* 헤더 */}
            <header style={S.header}>
                <div>
                    <button onClick={() => onChangeMonth(-1)} style={S.btn}>◀</button>
                </div>
                <div style={{ textAlign: "center", fontWeight: 700 }}>{yearMonth}</div>
                <div>
                    <button onClick={() => onChangeMonth(1)} style={S.btn}>▶</button>
                </div>
            </header>

            {/* 플랜 */}
            <section style={S.planBar}>
                {planAmount ? (
                    <>
                        <span>월 목표액:</span>
                        <span style={S.badge}>{fmtKRW(planAmount)}원</span>
                        <span style={{ color: "#888" }}>
              / 일기준 {fmtKRW(Math.floor(planAmount / (monthLen || 1)))}원
            </span>
                        <button
                            style={S.btnOutline}
                            onClick={() => { setPlanAmountInput(planAmount); setPlanModalOpen(true); }}
                        >
                            변경
                        </button>
                    </>
                ) : (
                    <button
                        style={S.btnPrimary}
                        onClick={() => { setPlanAmountInput(""); setPlanModalOpen(true); }}
                    >
                        월 목표액 등록
                    </button>
                )}
            </section>

            {/* 툴바 */}
            <section style={S.toolbar}>
                <button
                    style={S.btnPrimary}
                    onClick={() => openSpendModalForDate(selectedDate)}
                >
                    + 지출 입력
                </button>
            </section>

            {/* 표 */}
            <section style={S.tableCard}>
                <div style={S.tableHead}>
                    <div style={S.thDate}>일자</div>
                    <div style={S.th}>요일</div>
                    <div style={S.thRight}>하루사용한도</div>
                    <div style={S.thRight}>당일지출</div>
                    <div style={S.thRight}>종료후 이월</div>
                </div>

                <div>
                    {rows.map((row) => {
                        const isSel = row.dateStr === selectedDate;
                        return (
                            <div
                                key={row.dateStr}
                                style={{ ...S.tr, background: isSel ? "#f0f7ff" : "white", cursor: "pointer" }}
                                onClick={() => setSelectedDate(row.dateStr)}
                                onDoubleClick={() => openSpendModalForDate(row.dateStr)}
                                title="더블클릭하면 지출 입력/내역 창이 열립니다."
                            >
                                <div style={S.tdDate}>{row.dateStr.slice(-2)}일</div>
                                <div style={S.td}>{row.weekday}</div>
                                <div style={S.tdRight}>{fmtKRW(row.allowedToday)}원</div>
                                <div style={S.tdRight}>{fmtKRW(row.spend)}원</div>
                                <div style={{ ...S.tdRight, color: row.endCarry < 0 ? "#d00" : "#0a7" }}>
                                    {fmtKRW(row.endCarry)}원
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* 요약 */}
            <footer style={S.footer}>
                <div>
                    <strong>{selectedDate}</strong>{" "}
                    <span style={{ color: "#888" }}>
            (기준 한도 {fmtKRW(selectedRow?.allowedToday ?? 0)}원)
          </span>
                </div>
                <div>
                    이번 달 총지출:{" "}
                    <strong>
                        {fmtKRW(Object.values(spendsByDate).reduce((a, b) => a + (b || 0), 0))}원
                    </strong>
                </div>
            </footer>

            {/* 에러 */}
            {errorMsg && (
                <div style={S.errorBox}>
                    <span>{errorMsg}</span>
                    <button style={S.btnGhost} onClick={() => setErrorMsg("")}>×</button>
                </div>
            )}

            {/* 모달 – 월 목표액 */}
            <Modal open={planModalOpen} onClose={() => setPlanModalOpen(false)} title="월 목표액 설정/변경">
                <div style={S.formRow}>
                    <label>연-월</label>
                    <input
                        value={yearMonth}
                        onChange={(e) => setYearMonth(e.target.value)}
                        placeholder="YYYY-MM"
                        style={S.input}
                    />
                </div>
                <div style={S.formRow}>
                    <label>목표액(원)</label>
                    <input
                        type="number"
                        value={planAmountInput}
                        onChange={(e) => setPlanAmountInput(e.target.value)}
                        placeholder="예: 600000"
                        style={S.input}
                    />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button style={S.btn} onClick={() => setPlanModalOpen(false)}>취소</button>
                    <button
                        style={S.btnPrimary}
                        onClick={() => savePlan.mutate({
                            yearMonth,
                            amount: Math.round(Number(planAmountInput) || 0),
                        })}
                    >
                        저장
                    </button>
                </div>
            </Modal>

            {/* 모달 – 지출 입력 + 그 날 내역 */}
            <Modal open={spendModalOpen} onClose={() => setSpendModalOpen(false)} title={`지출 입력 · ${spendInput.date}`}>
                <div style={S.formRow}>
                    <label>일자</label>
                    <input
                        type="date"
                        value={spendInput.date}
                        onChange={(e) => setSpendInput((s) => ({ ...s, date: e.target.value }))}
                        style={S.input}
                    />
                </div>

                {/* 카테고리 선택/직접추가 */}
                {!useCustomCategory ? (
                    <>
                        <div style={S.formRow}>
                            <label>카테고리</label>
                            <select
                                value={spendInput.categoryId}
                                onChange={(e) => setSpendInput((s) => ({ ...s, categoryId: e.target.value }))}
                                style={S.input}
                            >
                                <option value="" disabled>선택하세요</option>
                                {(catQuery.data ?? []).map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                            <button style={S.btn} onClick={() => setUseCustomCategory(true)}>+ 직접 입력으로 추가</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={S.formRow}>
                            <label>새 카테고리</label>
                            <input
                                placeholder="예: 커피"
                                value={customCategoryName}
                                onChange={(e) => setCustomCategoryName(e.target.value)}
                                style={S.input}
                            />
                        </div>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 10 }}>
                            <button style={S.btn} onClick={() => setUseCustomCategory(false)}>취소</button>
                            <button
                                style={S.btnPrimary}
                                onClick={handleAddCategory}
                                disabled={!customCategoryName.trim() || categoryCreating}
                            >
                                {categoryCreating ? "추가 중..." : "카테고리 추가"}
                            </button>
                        </div>
                    </>
                )}

                <div style={S.formRow}>
                    <label>금액(원)</label>
                    <input
                        type="number"
                        value={spendInput.amount}
                        onChange={(e) => setSpendInput((s) => ({ ...s, amount: e.target.value }))}
                        placeholder="예: 30000"
                        style={S.input}
                    />
                </div>

                <div style={S.formRow}>
                    <label>메모</label>
                    <input
                        value={spendInput.memo}
                        onChange={(e) => setSpendInput((s) => ({ ...s, memo: e.target.value }))}
                        style={S.input}
                        placeholder="선택사항"
                    />
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#64748b" }}>
            저장 시 월({yearMonth}) 집계에 즉시 반영됩니다.
          </span>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button style={S.btn} onClick={() => setSpendModalOpen(false)}>취소</button>
                        <button
                            style={S.btnPrimary}
                            onClick={() =>
                                addSpend.mutate({
                                    yearMonth,
                                    date: spendInput.date,
                                    categoryId: Number(spendInput.categoryId) || undefined,
                                    amount: Math.round(Number(spendInput.amount) || 0),
                                    memo: spendInput.memo || "",
                                })
                            }
                            disabled={
                                (!useCustomCategory && !spendInput.categoryId) ||
                                !(Number(spendInput.amount) > 0) ||
                                !spendInput.date
                            }
                        >
                            저장
                        </button>
                    </div>
                </div>

                {/* ─────────────────────────────
            ✅ 여기부터 “그 날 지출 내역” 리스트
            ───────────────────────────── */}
                <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <strong>{spendInput.date} 지출 내역</strong>
                        <button
                            style={S.btn}
                            onClick={() =>
                                queryClient.invalidateQueries({ queryKey: ["spendByDate", yearMonth, spendInput.date] })
                            }
                            title="새로고침"
                        >
                            새로고침
                        </button>
                    </div>

                    {dateSpendQuery.isLoading ? (
                        <div>불러오는 중...</div>
                    ) : dateSpendQuery.isError ? (
                        <div style={{ color: "#d00" }}>
                            조회 실패: {String(dateSpendQuery.error?.response?.data?.message || dateSpendQuery.error?.message || "오류")}
                        </div>
                    ) : (dateSpendQuery.data?.items?.length ?? 0) === 0 ? (
                        <div style={{ color: "#64748b" }}>지출 내역이 없습니다.</div>
                    ) : (
                        <div>
                            <div style={S.dayListHead}>
                                <div style={{ flex: "0 0 60px" }}>ID</div>
                                <div style={{ flex: "0 0 120px" }}>카테고리</div>
                                <div style={{ flex: "0 0 100px", textAlign: "right" }}>금액</div>
                                <div style={{ flex: "1 1 auto" }}>메모</div>
                                <div style={{ flex: "0 0 80px" }}></div>
                            </div>
                            {(dateSpendQuery.data?.items ?? []).map((it) => (
                                <div key={it.id} style={S.dayListRow}>
                                    <div style={{ flex: "0 0 60px" }}>{it.id}</div>
                                    <div style={{ flex: "0 0 120px" }}>{it.categoryName ?? it.categoryId}</div>
                                    <div style={{ flex: "0 0 100px", textAlign: "right" }}>{fmtKRW(it.amount)}원</div>
                                    <div style={{ flex: "1 1 auto" }}>{it.memo}</div>
                                    <div style={{ flex: "0 0 80px", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                        <button
                                            style={S.btn}
                                            onClick={() => {
                                                // 간단 수정: 현재 값으로 입력 세팅
                                                setSpendInput({
                                                    date: dayjs(it.date).format("YYYY-MM-DD"),
                                                    categoryId: String(it.categoryId ?? ""),
                                                    amount: String(it.amount ?? ""),
                                                    memo: it.memo ?? "",
                                                });
                                            }}
                                            title="위 폼으로 불러오기"
                                        >
                                            수정
                                        </button>
                                        <button
                                            style={S.btnOutline}
                                            onClick={() => deleteSpend.mutate({ id: it.id })}
                                            title="삭제"
                                        >
                                            삭제
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}

/* ============ Provider ============ */
const queryClient = new QueryClient();
export default function BudgetPage() {
    return (
        <QueryClientProvider client={queryClient}>
            <BudgetPageInner />
        </QueryClientProvider>
    );
}

/* ============ 스타일 ============ */
const S = {
    wrap: { maxWidth: 920, margin: "0 auto", padding: 16 },
    header: {
        display: "grid",
        gridTemplateColumns: "80px 1fr 80px",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
    },
    planBar: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0 10px",
        flexWrap: "wrap",
    },
    toolbar: { display: "flex", justifyContent: "flex-end", margin: "8px 0 16px" },
    tableCard: {
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        overflow: "hidden",
        background: "white",
    },
    tableHead: {
        display: "grid",
        gridTemplateColumns: "80px 60px 1fr 1fr 1fr",
        padding: "10px 12px",
        background: "#f8fafc",
        borderBottom: "1px solid #e5e7eb",
        fontWeight: 600,
        color: "#334155",
    },
    thDate: { paddingRight: 8 },
    th: { textAlign: "left" },
    thRight: { textAlign: "right" },
    tr: {
        display: "grid",
        gridTemplateColumns: "80px 60px 1fr 1fr 1fr",
        padding: "10px 12px",
        borderBottom: "1px solid #f1f5f9",
    },
    tdDate: { fontVariantNumeric: "tabular-nums" },
    td: {},
    tdRight: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
    footer: {
        display: "flex",
        justifyContent: "space-between",
        padding: "12px 4px",
        color: "#334155",
    },
    badge: {
        background: "#eef6ff",
        color: "#1d4ed8",
        padding: "2px 8px",
        borderRadius: 999,
        fontWeight: 600,
    },
    btn: {
        padding: "6px 10px",
        border: "1px solid #d1d5db",
        background: "white",
        borderRadius: 8,
        cursor: "pointer",
    },
    btnOutline: {
        padding: "6px 10px",
        border: "1px solid #60a5fa",
        color: "#1d4ed8",
        background: "white",
        borderRadius: 8,
        cursor: "pointer",
    },
    btnPrimary: {
        padding: "6px 12px",
        border: "1px solid #2563eb",
        background: "#2563eb",
        color: "white",
        borderRadius: 8,
        cursor: "pointer",
    },
    btnGhost: {
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: 18,
    },
    backdrop: {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 1000,
    },
    modal: { width: 640, maxWidth: "96vw", background: "white", borderRadius: 12, overflow: "hidden" },
    modalHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 12px",
        borderBottom: "1px solid #eee",
    },
    formRow: {
        display: "grid",
        gridTemplateColumns: "100px 1fr",
        alignItems: "center",
        gap: 8,
        marginBottom: 10,
    },
    input: {
        padding: "8px 10px",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        width: "100%",
    },
    errorBox: {
        marginTop: 12,
        padding: "8px 12px",
        border: "1px solid #fecaca",
        background: "#fef2f2",
        color: "#991b1b",
        borderRadius: 8,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
    },
    dayListHead: {
        display: "flex",
        padding: "10px 8px",
        background: "#f8fafc",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        fontWeight: 600,
        color: "#334155",
    },
    dayListRow: {
        display: "flex",
        padding: "10px 8px",
        borderBottom: "1px solid #f1f5f9",
        alignItems: "center",
    },
};
