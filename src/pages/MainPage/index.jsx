import React from "react";
import { useNavigate } from "react-router-dom";

const MainPage = () => {
    const navigate = useNavigate();

    return (
        <div>
            <h1>메인 페이지</h1>
            <button onClick={() => navigate("/investRate")}>월평균 수익률 보기</button>
        </div>
    );
};

export default MainPage;