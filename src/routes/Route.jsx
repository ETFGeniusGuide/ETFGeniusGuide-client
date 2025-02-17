import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import MainPage from '../pages/MainPage'; // MainPage 컴포넌트가 있다고 가정

function RouteLink() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LoginPage />} />
                <Route path="/main" element={<MainPage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default RouteLink;
