import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import axios from "axios";
import { useQuery, useMutation, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {create} from "zustand";

/* =========================================================
   0) QueryClient (이 파일만으로도 동작하도록 내부에서 생성)
   ========================================================= */
const queryClient = new QueryClient();

/* =========================================================
   1) Axios 설정
   ========================================================= */
const api = axios.create({
    baseURL: "http://localhost:8080",
    headers: { "Content-Type": "application/json" },
});

/* =========================================================
   2) Zustand Store – 선택 월/일, 로컬 스펜드 캐시
   ========================================================= */
const useBudgetStore = create((set, get) => ({
    yearMonth: dayjs().format("YYYY-MM"),
    selectedDate: dayjs().format("YYYY-MM-DD"),
    // 사용자가 현재 세션에서 추가한 스펜드(서버 list 엔드포인트 없을 때 사용)
    localSpends: [], // { id, yearMonth, date, categoryId, amount, memo }
    setYearMonth: (ym) =>
        set({
            yearMonth: ym,
            selectedDate: dayjs(ym + "-01").format("YYYY-MM-DD"),
            localSpends: [], // 월 바뀌면 로컬 캐시 초기화
        }),
    setSelectedDate: (d) => set({ selectedDate: d }),
    pushLocalSpend: (sp) => set({ localSpends: [...get().localSpends, sp] }),
    removeLocalSpend: (id) =>
        set({ localSpends: get().localSpends.filter((s) => s.id !== id) }),
}));

/* =========================================================
   3) API 래퍼 (Swagger 그대로)
   ========================================================= */
// Plan
const postPlanGet = async (yearMonth) => {
    const { data } = await api.post("/api/budget/plans/get", { yearMonth });
    return data; // { planId, yearMonth, amount, createdAt }
};
const postPlanCreate = async ({ yearMonth, amount }) => {
    const { data } = await api.post("/api/budget/plans/create", { yearMonth, amount });
    return data;
};
// (옵션) update가 필요하면 여기에 추가
// const patchPlanUpdate = async (payload) => api.patch("/api/budget/plans/update", payload);

// Category
const postCategoryList = async (includeInactive = false) => {
    const { data } = await api.post("/api/budget/categories/list", { includeInactive });
    return data; // [{id, name, active, custom}, ...]
};

// Spends
const postSpendAdd = async (payload) => {
    const { data } = await api.post("/api/budget/spends/add", payload);
    return data; // { id, yearMonth, date, categoryId, amount, memo }
};
const postSpendDelete = async ({ id }) => {
    const { data } = await api.post("/api/budget/spends/delete", { id });
    return data;
};
const patchSpendUpdate = async (payload) => {
    const { data } = await api.patch("/api/budget/spends/update", payload);
    return data;
};

// (SEARCH_TODO) 서버 목록 API가 준비되면 여기 추가해서 실제 스펜드 불러오기
// const postSpendList = async ({ yearMonth }) => {
//   const { data } = await api.post("/api/budget/spends/list", { yearMonth });
//   return data; // [{ id, yearMonth, date, categoryId, amount, memo }, ...]
// };

/* =========================================================
   4) 유틸 – 월 일자 생성, 금액 포맷, 롤링 한도 계산
   ========================================================= */
const formatKRW = (n) =>
    (n ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 0 });

const buildMonthDays = (yearMonth) => {
    const start = dayjs(yearMonth + "-01");
    const days = start.daysInMonth();
    const out = [];
    for (let d = 1; d <= days; d++) {
        const date = start.date(d);
        out.push({
            dateStr: date.format("YYYY-MM-DD"),
            weekday: ["일", "월", "화", "수", "목", "금", "토"][date.day()],
        });
    }
    return out;
};

/** 엑셀과 동일한 로직
 * base = floor(plan.amount / monthDays)
 * allowedToday = base + carryFromPrev
 * endOfDayCarry = allowedToday - spendToday
 * 다음 날 carry = endOfDayCarry
 */
const buildAllowanceTable = ({ yearMonth, planAmount, spendsByDate }) => {
    const days = buildMonthDays(yearMonth);
    const base = Math.floor((planAmount ?? 0) / days.length);
    let carry = 0;
    return days.map((d) => {
        const daySpend = spendsByDate[d.dateStr] ?? 0;
        const allowedToday = base + carry;
        const endCarry = allowedToday - daySpend;
        carry = endCarry;
        return {
            ...d,
            base,
            allowedToday,
            spend: daySpend,
            endCarry,
        };
    });
};

/* =========================================================
   5) 모달 컴포넌트 (아주 심플한 CSS)
   ========================================================= */
const Modal = ({ open, onClose, children, title }) => {
    if (!open) return null;
    return (
        <div style={S.backdrop}>
            <div style={S.modal}>
                <div style={S.modalHeader}>
                    <strong>{title}</strong>
                    <button onClick={onClose} style={S.btnGhost}>×</button>
                </div>
                <div style={{ padding: 12 }}>{children}</div>
            </div>
        </div>
    );
};

/* =========================================================
   6) 본문 페이지
   ========================================================= */
function BudgetPageInner() {
    const { yearMonth, selectedDate, setYearMonth, setSelectedDate, localSpends, pushLocalSpend, removeLocalSpend } =
        useBudgetStore();

    // UI 상태
    const [planModalOpen, setPlanModalOpen] = useState(false);
    const [spendModalOpen, setSpendModalOpen] = useState(false);

    // 입력 상태
    const [planAmountInput, setPlanAmountInput] = useState("");
    const [spendInput, setSpendInput] = useState({
        date: selectedDate,
        categoryId: "",
        amount: "",
        memo: "",
    });

    // 6-1) 쿼리: 카테고리/플랜
    const catQuery = useQuery({
        queryKey: ["categories"],
        queryFn: () => postCategoryList(false),
    });

    const planQuery = useQuery({
        queryKey: ["plan", yearMonth],
        queryFn: () => postPlanGet(yearMonth),
        retry: false,
    });

    // (SEARCH_TODO) 서버 스펜드 목록 – 준비되면 활성화
    // const spendListQuery = useQuery({
    //   queryKey: ["spends", yearMonth],
    //   queryFn: () => postSpendList({ yearMonth }),
    // });

    // 6-2) 변이: 플랜 생성, 스펜드 추가/수정/삭제
    const createPlanMutation = useMutation({
        mutationFn: postPlanCreate,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["plan", yearMonth] });
            setPlanModalOpen(false);
        },
    });

    const addSpendMutation = useMutation({
        mutationFn: postSpendAdd,
        onSuccess: (data) => {
            // 서버가 부여한 id로 로컬 캐시에 반영
            pushLocalSpend(data);
            setSpendModalOpen(false);
        },
    });

    const deleteSpendMutation = useMutation({
        mutationFn: postSpendDelete,
        onSuccess: (_, vars) => {
            removeLocalSpend(vars.id);
        },
    });

    // 6-3) 월 일자 / 스펜드 합계 by date
    const monthDays = useMemo(() => buildMonthDays(yearMonth), [yearMonth]);

    const spendsByDate = useMemo(() => {
        // 서버 목록 API가 있으면 spendListQuery.data를 합산
        const fromLocal = localSpends.filter((s) => s.yearMonth === yearMonth);
        const map = {};
        for (const s of fromLocal) {
            map[s.date] = (map[s.date] ?? 0) + Math.round(Number(s.amount) || 0);
        }
        // (SEARCH_TODO) 서버 목록 합치기
        // if (spendListQuery.data) {
        //   for (const s of spendListQuery.data) {
        //     map[s.date] = (map[s.date] ?? 0) + (s.amount ?? 0);
        //   }
        // }
        return map;
    }, [localSpends, yearMonth /*, spendListQuery.data*/]);

    const planAmount = planQuery.data?.amount ?? null;
    const table = useMemo(
        () =>
            buildAllowanceTable({
                yearMonth,
                planAmount: planAmount || 0,
                spendsByDate,
            }),
        [yearMonth, planAmount, spendsByDate]
    );

    // 6-4) 헬퍼
    const onChangeMonth = (offset) => {
        const next = dayjs(yearMonth + "-01").add(offset, "month").format("YYYY-MM");
        setYearMonth(next);
    };

    const selectedRow = table.find((r) => r.dateStr === selectedDate);

    // 6-5) 화면
    return (
        <div style={S.wrap}>
            <header style={S.header}>
                <div>
                    <button onClick={() => onChangeMonth(-1)} style={S.btn}>◀</button>
                    <strong style={{ margin: "0 8px" }}>{yearMonth}</strong>
                    <button onClick={() => onChangeMonth(1)} style={S.btn}>▶</button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {planAmount ? (
                        <>
                            <span>월 목표액:</span>
                            <span style={S.badge}>{formatKRW(planAmount)}원</span>
                            <span style={{ color: "#888" }}>
                / 일기준 {formatKRW(Math.floor(planAmount / monthDays.length))}원
              </span>
                            <button style={S.btnOutline} onClick={() => {
                                setPlanAmountInput(planAmount);
                                setPlanModalOpen(true);
                            }}>
                                변경
                            </button>
                        </>
                    ) : (
                        <button style={S.btnPrimary} onClick={() => setPlanModalOpen(true)}>
                            월 목표액 등록
                        </button>
                    )}
                </div>
            </header>

            <section style={S.toolbar}>
                <button
                    style={S.btnPrimary}
                    onClick={() => {
                        setSpendInput({
                            date: selectedDate,
                            categoryId: "",
                            amount: "",
                            memo: "",
                        });
                        setSpendModalOpen(true);
                    }}
                >
                    + 지출 입력
                </button>
            </section>

            <section style={S.tableCard}>
                <div style={S.tableHead}>
                    <div style={S.thDate}>일자</div>
                    <div style={S.th}>요일</div>
                    <div style={S.thRight}>하루사용한도</div>
                    <div style={S.thRight}>당일지출</div>
                    <div style={S.thRight}>종료후 이월</div>
                </div>

                <div>
                    {table.map((row) => {
                        const isSel = row.dateStr === selectedDate;
                        return (
                            <div
                                key={row.dateStr}
                                style={{ ...S.tr, background: isSel ? "#f0f7ff" : "white", cursor: "pointer" }}
                                onClick={() => useBudgetStore.getState().setSelectedDate(row.dateStr)}
                            >
                                <div style={S.tdDate}>{row.dateStr.slice(-2)}일</div>
                                <div style={S.td}>{row.weekday}</div>
                                <div style={S.tdRight}>{formatKRW(row.allowedToday)}원</div>
                                <div style={S.tdRight}>{formatKRW(row.spend)}원</div>
                                <div style={{ ...S.tdRight, color: row.endCarry < 0 ? "#d00" : "#0a7" }}>
                                    {formatKRW(row.endCarry)}원
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* 하단 요약 */}
            <footer style={S.footer}>
                <div>
                    <strong>{selectedDate}</strong>{" "}
                    <span style={{ color: "#888" }}>
            (기준 한도 {formatKRW(selectedRow?.allowedToday ?? 0)}원)
          </span>
                </div>
                <div>
                    이번 달 총지출:{" "}
                    <strong>
                        {formatKRW(
                            Object.values(spendsByDate).reduce((a, b) => a + (b || 0), 0)
                        )}
                        원
                    </strong>
                </div>
            </footer>

            {/* 모달 – 월 목표액 */}
            <Modal
                open={planModalOpen}
                onClose={() => setPlanModalOpen(false)}
                title="월 목표액 설정"
            >
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
                    <button style={S.btn} onClick={() => setPlanModalOpen(false)}>
                        취소
                    </button>
                    <button
                        style={S.btnPrimary}
                        onClick={() =>
                            createPlanMutation.mutate({
                                yearMonth,
                                amount: Math.round(Number(planAmountInput) || 0),
                            })
                        }
                    >
                        저장
                    </button>
                </div>
            </Modal>

            {/* 모달 – 지출 입력 */}
            <Modal
                open={spendModalOpen}
                onClose={() => setSpendModalOpen(false)}
                title="지출 입력"
            >
                <div style={S.formRow}>
                    <label>일자</label>
                    <input
                        type="date"
                        value={spendInput.date}
                        onChange={(e) => setSpendInput((s) => ({ ...s, date: e.target.value }))}
                        style={S.input}
                    />
                </div>

                <div style={S.formRow}>
                    <label>카테고리</label>
                    <select
                        value={spendInput.categoryId}
                        onChange={(e) =>
                            setSpendInput((s) => ({ ...s, categoryId: e.target.value }))
                        }
                        style={S.input}
                    >
                        <option value="" disabled>
                            선택하세요
                        </option>
                        {(catQuery.data ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>

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

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button style={S.btn} onClick={() => setSpendModalOpen(false)}>
                        취소
                    </button>
                    <button
                        style={S.btnPrimary}
                        onClick={() =>
                            addSpendMutation.mutate({
                                yearMonth,
                                date: spendInput.date,
                                categoryId: Number(spendInput.categoryId),
                                amount: Math.round(Number(spendInput.amount) || 0),
                                memo: spendInput.memo || "",
                            })
                        }
                        disabled={!spendInput.categoryId || !spendInput.amount}
                    >
                        저장
                    </button>
                </div>
            </Modal>
        </div>
    );
}

/* =========================================================
   7) Export – QueryClientProvider로 감싸서 내보냄
   ========================================================= */
export default function BudgetPage() {
    return (
        <QueryClientProvider client={queryClient}>
            <BudgetPageInner />
        </QueryClientProvider>
    );
}

/* =========================================================
   8) 아주 간단한 스타일
   ========================================================= */
const S = {
    wrap: { maxWidth: 920, margin: "0 auto", padding: 16 },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "8px 0",
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
    modal: { width: 420, background: "white", borderRadius: 12, overflow: "hidden" },
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
};
