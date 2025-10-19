import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import MainPage from '../pages/MainPage';
import NaverCallback from "../pages/NaverCallback";
import InvestRatePage from "../pages/InvestRatePage";
import BugetPage from "../pages/BudgetPage";

function RouteLink() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LoginPage />} />
                <Route path="/main" element={<MainPage />} />
                <Route path="/naver-callback" element={<NaverCallback />} />
                <Route path="/investRate" element={<InvestRatePage />} />
                <Route path="/buget" element={<BugetPage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default RouteLink;
