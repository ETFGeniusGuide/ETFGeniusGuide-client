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

/* ============ API 래퍼 (OpenAPI에 맞춤) ============ */
// Plan
const apiPlanGet = async (ym) =>
    (await api.post("/api/budget/plans/get", { ym })).data;
const apiPlanCreate = async ({ ym, amount }) =>
    (await api.post("/api/budget/plans/create", { ym, amount })).data;
const apiPlanUpdate = async ({ ym, amount }) =>
    (await api.patch("/api/budget/plans/update", { ym, amount })).data;

// Category
const apiCategoryList = async (includeInactive = false) =>
    (await api.post("/api/budget/categories/list", { includeInactive })).data;
const apiCategoryCreate = async ({ name }) =>
    (await api.post("/api/budget/categories/create", { name })).data;

// Spend
const apiSpendCreate = async (payload) =>
    (await api.post("/api/budget/spends/add", payload)).data;
const apiSpendDelete = async ({ id }) =>
    (await api.post("/api/budget/spends/delete", { id })).data;
const apiSpendUpdate = async (payload) =>
    (await api.patch("/api/budget/spends/update", payload)).data;

// 조회: 월 단위 → 일자 필터링
const apiSpendLoadByMonth = async (ym) =>
    (await api.post("/api/budget/spends/loadByMonth", { ym })).data;

// 상세
const apiSpendGetDetail = async (id) =>
    (await api.post("/api/budget/spends/getDetail", { id })).data;

/* ============ 유틸 ============ */
const fmtKRW = (n) =>
    (n ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 0 });

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
const Modal = ({ open, onClose, children, title, width = 640 }) =>
    !open ? null : (
        <div style={S.backdrop}>
            <div style={{ ...S.modal, width, maxWidth: "96vw" }}>
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
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [detailId, setDetailId] = useState(null);

    const [errorMsg, setErrorMsg] = useState("");

    const [planAmountInput, setPlanAmountInput] = useState("");
    const [spendInput, setSpendInput] = useState({
        date: selectedDate,
        categoryId: "",
        amount: "",
        memo: "",
    });

    // “더블클릭이면 입력폼 접고, +지출입력이면 펼치기”
    const [inputCollapsed, setInputCollapsed] = useState(false);

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

    // ✅ 월 지출(모달의 “그 날 리스트”는 여기서 필터링)
    const monthSpendsQuery = useQuery({
        queryKey: ["spendByMonth", yearMonth],
        queryFn: () => apiSpendLoadByMonth(yearMonth),
        enabled: spendModalOpen || !!yearMonth,
    });

    const dayItems = useMemo(() => {
        const list = monthSpendsQuery.data?.spendDetailResList ?? [];
        return list.filter((it) => dayjs(it.date).format("YYYY-MM-DD") === spendInput.date);
    }, [monthSpendsQuery.data, spendInput.date]);

    // 상세
    const detailQuery = useQuery({
        queryKey: ["spendDetail", detailId],
        queryFn: () => apiSpendGetDetail(detailId),
        enabled: detailModalOpen && !!detailId,
    });

    // 플랜 업서트(충돌시는 update)
    const savePlan = useMutation({
        mutationFn: async ({ ym, amount }) => {
            try {
                return await apiPlanCreate({ ym, amount });
            } catch (e) {
                // 중복 생성 등은 update로 우회
                return await apiPlanUpdate({ ym, amount });
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
            pushLocalSpend({ id: tempId, __temp: true, ...payload });
            return { tempId };
        },
        onSuccess: (data, _vars, ctx) => {
            // 서버에서 동일 항목을 가져오므로 로컬 임시값은 제거 (교체금지)
            if (ctx?.tempId) removeLocalSpend(ctx.tempId);
            // 월 목록 캐시를 낙관 반영(중복 방지)
            queryClient.setQueryData(["spendByMonth", yearMonth], (prev) => {
                if (!prev) return prev;
                const list = prev.spendDetailResList ?? [];
                // 이미 들어있으면 중복 추가 X
                if (list.some((x) => x.id === data?.id)) return prev;
                return {...prev, spendDetailResList: [...list, data]};
            });
            // 그래도 서버 기준으로 정합성 맞춤
            queryClient.invalidateQueries({queryKey: ["spendByMonth", yearMonth]});
            setSpendModalOpen(false);
        },
        onError: (e, vars, ctx) => {
            if (ctx?.tempId) removeLocalSpend(ctx.tempId);
            setErrorMsg(e?.response?.data?.message || e?.message || "지출 저장에 실패했습니다.");
            queryClient.invalidateQueries({ queryKey: ["spendByMonth", yearMonth] });
        },
    });

    const deleteSpend = useMutation({
        mutationFn: apiSpendDelete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["spendByMonth", yearMonth] });
        },
    });

    const updateSpend = useMutation({
        mutationFn: apiSpendUpdate,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["spendByMonth", yearMonth] });
            queryClient.invalidateQueries({ queryKey: ["spendDetail", detailId] });
            setDetailModalOpen(false);
        },
        onError: (e) => {
            setErrorMsg(e?.response?.data?.message || e?.message || "지출 수정에 실패했습니다.");
        },
    });

    // 월 집계(상단 표 계산)
    const spendsByDate = useMemo(() => {
        const map = {};
        for (const s of localSpends.filter((x) => x.yearMonth === yearMonth)) {
            map[s.date] = (map[s.date] ?? 0) + Math.round(Number(s.amount) || 0);
        }
        // 서버 월데이터도 반영
        (monthSpendsQuery.data?.spendDetailResList ?? []).forEach((it) => {
            const k = dayjs(it.date).format("YYYY-MM-DD");
            map[k] = (map[k] ?? 0) + (it.amount || 0);
        });
        return map;
    }, [localSpends, yearMonth, monthSpendsQuery.data]);

    const planAmount = planQuery.data?.amount ?? 0;
    const rows = useMemo(
        () => buildAllowance({ yearMonth, planAmount, spendsByDate }),
        [yearMonth, planAmount, spendsByDate]
    );

    const onChangeMonth = (offset) =>
        setYearMonth(dayjs(yearMonth + "-01").add(offset, "month").format("YYYY-MM"));
    const selectedRow = rows.find((r) => r.dateStr === selectedDate);
    const monthLen = rows.length;

    const openSpendModalForDate = (dateStr, collapseInput) => {
        setSpendInput({
            date: dateStr,
            categoryId: "",
            amount: "",
            memo: "",
        });
        setUseCustomCategory(false);
        setCustomCategoryName("");
        setInputCollapsed(!!collapseInput);
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
                    onClick={() => openSpendModalForDate(selectedDate, false)} // 입력 펼치기
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
                                onDoubleClick={() => openSpendModalForDate(row.dateStr, true)} // 더블클릭 → 입력 접기
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
                            ym: yearMonth,
                            amount: Math.round(Number(planAmountInput) || 0),
                        })}
                    >
                        저장
                    </button>
                </div>
            </Modal>

            {/* 모달 – 지출 입력 + 그 날 내역(리스트 항상 노출) */}
            <Modal
                open={spendModalOpen}
                onClose={() => setSpendModalOpen(false)}
                title={`지출 입력 · ${spendInput.date}`}
                width={760}
            >
                {/* 입력 폼 토글 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong>지출 입력</strong>
                    <button
                        style={S.btn}
                        onClick={() => setInputCollapsed((v) => !v)}
                        title="입력 폼 열기/닫기"
                    >
                        {inputCollapsed ? "입력 폼 열기" : "입력 폼 닫기"}
                    </button>
                </div>

                {!inputCollapsed && (
                    <>
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

                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                            <button style={S.btn} onClick={() => setSpendModalOpen(false)}>취소</button>
                            <button
                                style={S.btnPrimary}
                                onClick={() =>
                                    addSpend.mutate({
                                        date: spendInput.date,
                                        categoryId: Number(spendInput.categoryId) || undefined,
                                        amount: Math.round(Number(spendInput.amount) || 0),
                                        memo: spendInput.memo || "",
                                        yearMonth, // 로컬합계용(서버엔 무시됨)
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

                        <div style={{ height: 12 }} />
                        <div style={{ color: "#64748b" }}>
                            저장 시 월({yearMonth}) 집계에 즉시 반영됩니다.
                        </div>
                        <div style={{ height: 16 }} />
                    </>
                )}

                {/* ─────────────────────────────
            ✅ “그 날 지출 내역” 리스트 (항상 표시)
        ───────────────────────────── */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <strong>{spendInput.date} 지출 내역</strong>
                    <button
                        style={S.btn}
                        onClick={() => queryClient.invalidateQueries({ queryKey: ["spendByMonth", yearMonth] })}
                        title="새로고침"
                    >
                        새로고침
                    </button>
                </div>

                {monthSpendsQuery.isLoading ? (
                    <div>불러오는 중...</div>
                ) : monthSpendsQuery.isError ? (
                    <div style={{ color: "#d00" }}>
                        조회 실패: {String(monthSpendsQuery.error?.response?.data?.message || monthSpendsQuery.error?.message || "오류")}
                    </div>
                ) : dayItems.length === 0 ? (
                    <div style={{ color: "#64748b" }}>지출 내역이 없습니다.</div>
                ) : (
                    <div>
                        <div style={S.dayListHead}>
                            <div style={{ flex: "0 0 60px" }}>ID</div>
                            <div style={{ flex: "0 0 120px" }}>카테고리</div>
                            <div style={{ flex: "0 0 100px" }}>금액</div>
                            <div style={{ flex: "1 1 auto" }}>메모</div>
                            <div style={{ flex: "0 0 120px" }}></div>
                        </div>
                        {dayItems.map((it) => (
                            <div key={it.id} style={S.dayListRow}>
                                <div style={{ flex: "0 0 60px" }}>{it.id}</div>
                                <div style={{ flex: "0 0 120px" }}>{it.categoryName ?? it.categoryId}</div>
                                <div style={{ flex: "0 0 100px" }}>{fmtKRW(it.amount)}원</div>
                                <div style={{ flex: "1 1 auto" }}>{it.memo}</div>
                                <div style={{ flex: "0 0 120px", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                    <button
                                        style={S.btn}
                                        onClick={() => { setDetailId(it.id); setDetailModalOpen(true); }}
                                        title="세부 보기/수정"
                                    >
                                        세부
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
            </Modal>

            {/* 모달 – 지출 세부(읽기→수정→저장) */}
            <Modal
                open={detailModalOpen}
                onClose={() => setDetailModalOpen(false)}
                title="지출 세부 내역"
                width={560}
            >
                {detailQuery.isLoading ? (
                    <div>불러오는 중...</div>
                ) : detailQuery.isError ? (
                    <div style={{ color: "#d00" }}>
                        로드 실패: {String(detailQuery.error?.response?.data?.message || detailQuery.error?.message || "오류")}
                    </div>
                ) : !detailQuery.data ? (
                    <div style={{ color: "#64748b" }}>데이터 없음</div>
                ) : (
                    <DetailForm
                        data={detailQuery.data}
                        categories={catQuery.data ?? []}
                        onCancel={() => setDetailModalOpen(false)}
                        onSave={(payload) => updateSpend.mutate(payload)}
                    />
                )}
            </Modal>
        </div>
    );
}

/* ============ 세부 수정 폼 컴포넌트 ============ */
function DetailForm({ data, categories, onCancel, onSave }) {
    const [form, setForm] = useState({
        id: data.id,
        date: dayjs(data.date).format("YYYY-MM-DD"),
        categoryId: data.categoryId ?? "",
        amount: data.amount ?? "",
        memo: data.memo ?? "",
    });

    return (
        <div>
            <div style={S.formRow}>
                <label>ID</label>
                <div>{form.id}</div>
            </div>
            <div style={S.formRow}>
                <label>일자</label>
                <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
                    style={S.input}
                />
            </div>
            <div style={S.formRow}>
                <label>카테고리</label>
                <select
                    value={form.categoryId}
                    onChange={(e) => setForm((s) => ({ ...s, categoryId: Number(e.target.value) }))}
                    style={S.input}
                >
                    <option value="" disabled>선택하세요</option>
                    {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>
            <div style={S.formRow}>
                <label>금액(원)</label>
                <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm((s) => ({ ...s, amount: Math.round(Number(e.target.value) || 0) }))}
                    style={S.input}
                />
            </div>
            <div style={S.formRow}>
                <label>메모</label>
                <input
                    value={form.memo}
                    onChange={(e) => setForm((s) => ({ ...s, memo: e.target.value }))}
                    style={S.input}
                    placeholder="선택사항"
                />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={S.btn} onClick={onCancel}>취소</button>
                <button
                    style={S.btnPrimary}
                    onClick={() =>
                        onSave({
                            id: form.id,
                            // UpdateReq: id 필수, 나머지 선택 (스펙 기준)
                            categoryId: form.categoryId || undefined,
                            amount: Number(form.amount) || undefined,
                            memo: form.memo || "",
                        })
                    }
                    disabled={!form.id}
                >
                    저장
                </button>
            </div>
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
    modal: { background: "white", borderRadius: 12, overflow: "hidden" },
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
