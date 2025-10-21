import React from "react";
import {useNavigate} from "react-router-dom";

const MainPage = () => {
    const navigate = useNavigate();

    return (
        <div>
            <h1>메인 페이지</h1>
            <div>
                <button onClick={() => navigate("/investRate")}>월평균 수익률 보기</button>
            </div>
            <div>
                <button onClick={() => navigate("/buget")}>변동지출가계부 보기</button>
            </div>
        </div>
    );
};

export default MainPage;