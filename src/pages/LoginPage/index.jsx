import React from "react";
import naverLoginImg from "../../assets/imgs/btnG_naverlogin.png";
import {HOME_BASE_URL } from "../../config/urlConfig"

const LoginPage = () => {
    const clientId = "EfRiZeozlA__LT3jUCi2"; // 네이버 클라이언트 ID
    const redirectUri = `http://localhost:3001/naver-callback`; // 프론트 콜백 URI
    const state = "randomStateValue"; // CSRF 방지용

    const handleNaverLogin = () => {
        const naverLoginUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
        window.location.href = naverLoginUrl; // 네이버 로그인 페이지로 이동
    };

    return (
        <div>
            <h2>네이버 로그인</h2>
            <img
                src={naverLoginImg}
                alt="네이버 로그인"
                onClick={handleNaverLogin}
                style={{ cursor: "pointer" }}
            />
        </div>
    );
};

export default LoginPage;
