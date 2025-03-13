import React, { useState } from "react";
import axios from "axios";

const InvestRatePage = () => {
    const [formData, setFormData] = useState({
        startDate: "2023-06-01",
        endDate: "2024-08-01",
        ndxRate: "3",
        spxRate: "3",
        djiRate: "3",
    });

    const [rates, setRates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // 로컬스토리지에서 accessToken 가져오기
        const accessToken = localStorage.getItem("accessToken");

        if (!accessToken) {
            setError("로그인이 필요합니다.");
            setLoading(false);
            return;
        }

        try {
            const response = await axios.post("http://localhost:8080/stock/calc", formData, {
                headers: {
                    Authorization: `Bearer ${accessToken}`, // JWT 토큰 추가
                    "Content-Type": "application/json",
                },
            });

            setRates(response.data); // List<RateCalculationResponse> 데이터를 저장
            console.log(rates)
        } catch (err) {
            console.error("수익률 데이터를 가져오는 데 실패했습니다.", err);
            setError("데이터를 불러오는 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1>월평균 수익률</h1>

            {/* 입력 폼 */}
            <form onSubmit={handleSubmit}>
                <label>
                    시작 날짜: <input type="date" name="startDate" value={formData.startDate} onChange={handleChange} required />
                </label>
                <br />
                <label>
                    종료 날짜: <input type="date" name="endDate" value={formData.endDate} onChange={handleChange} required />
                </label>
                <br />
                <label>
                    나스닥100 지수: <input type="number" name="ndxRate" value={formData.ndxRate} onChange={handleChange} required />
                </label>
                <br />
                <label>
                    S&P500 지수: <input type="number" name="spxRate" value={formData.spxRate} onChange={handleChange} required />
                </label>
                <br />
                <label>
                    미국배당다우존스 지수: <input type="number" name="djiRate" value={formData.djiRate} onChange={handleChange} required />
                </label>
                <br />
                <button type="submit" disabled={loading}>
                    {loading ? "계산 중..." : "수익률 계산"}
                </button>
            </form>

            {/* 에러 메시지 */}
            {error && <p style={{ color: "red" }}>{error}</p>}

            {/* 결과 테이블 */}
            {rates.length > 0 && (
                <table border="1">
                    <thead>
                    <tr>
                        <th>날짜</th>
                        <th>수익률 (%)</th>
                    </tr>
                    </thead>
                    <tbody>
                    {rates.map((rate, index) => (
                        <tr key={index}>
                            <td>{rate.date}</td>
                            <td>{rate.roi.toFixed(2)}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default InvestRatePage;
