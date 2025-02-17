import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import MainPage from '../pages/MainPage';
import NaverCallback from "../pages/NaverCallback";

function RouteLink() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LoginPage />} />
                <Route path="/main" element={<MainPage />} />
                <Route path="/naver-callback" element={<NaverCallback />} />
            </Routes>
        </BrowserRouter>
    );
}

export default RouteLink;
