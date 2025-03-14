import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL} from "../config/urlConfig"

const NaverCallback = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");

        if (code && state) {
            axios
                .get(`${API_BASE_URL}/member/naverlogin?code=${code}&state=${state}`)
                .then((response) => {
                    const { accessToken, refreshToken } = response.data;

                    if (accessToken && refreshToken) {
                        // JWT 토큰 저장
                        localStorage.setItem("accessToken", accessToken);
                        localStorage.setItem("refreshToken", refreshToken);
                        navigate("/main"); // 메인 페이지로 이동
                    } else {
                        console.error("토큰을 받지 못했습니다.");
                    }
                })
                .catch((error) => {
                    console.error("네이버 로그인 실패:", error);
                });
        } else {
            console.error("code 또는 state 값이 없습니다.");
        }
    }, [navigate]);

    return <div>로그인 처리 중...</div>;
};

export default NaverCallback;