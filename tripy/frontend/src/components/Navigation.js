import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navigation = ({ signOut, user }) => {
  const location = useLocation();

  const navStyle = {
    background: 'linear-gradient(135deg, #8B1538 0%, #D4526A 100%)',
    padding: '1rem 2rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: 'white',
    boxShadow: '0 4px 20px rgba(139, 21, 56, 0.3)'
  };

  const linkStyle = {
    color: 'white',
    textDecoration: 'none',
    margin: '0 0.5rem',
    padding: '8px 16px',
    borderRadius: '20px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    transition: 'all 0.3s ease',
    fontSize: '14px',
    fontWeight: '500'
  };

  const activeLinkStyle = {
    ...linkStyle,
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: 'translateY(-1px)'
  };

  return (
    <nav style={navStyle}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: '24px', fontWeight: 'bold', marginRight: '2rem' }}>
          <img src="/logo.png" alt="Tripy" style={{ width: '40px', height: '40px', marginRight: '10px', borderRadius: '50%' }} />
          Tripy
        </div>
        <Link to="/chat" style={location.pathname === '/chat' ? activeLinkStyle : linkStyle}>
          AI相談
        </Link>
        <Link to="/itinerary" style={location.pathname === '/itinerary' ? activeLinkStyle : linkStyle}>
          旅程表
        </Link>
        <Link to="/map" style={location.pathname === '/map' ? activeLinkStyle : linkStyle}>
          マップ
        </Link>
        <Link to="/booking" style={location.pathname === '/booking' ? activeLinkStyle : linkStyle}>
          予約管理
        </Link>
        <Link to="/todo" style={location.pathname === '/todo' ? activeLinkStyle : linkStyle}>
          TODO
        </Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ marginRight: '1rem', fontSize: '14px', fontWeight: '500' }}>こんにちは、{user.username}さん</span>
        <button onClick={signOut} className="btn" style={{ fontSize: '12px', padding: '8px 16px' }}>
          ログアウト
        </button>
      </div>
    </nav>
  );
};

export default Navigation;