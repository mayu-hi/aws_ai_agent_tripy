import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './styles.css';
import Navigation from './components/Navigation';
import ChatPage from './pages/ChatPage';
import ItineraryPage from './pages/ItineraryPage';
import MapPage from './pages/MapPage';
import BookingPage from './pages/BookingPage';
import TodoPage from './pages/TodoPage';

// Amplify設定（serverless deployの出力値に更新してください）
Amplify.configure({
  Auth: {
    region: 'us-west-2',
    userPoolId: 'us-west-2_7CK2cNK6i', // CognitoUserPoolId の値
    userPoolWebClientId: '5pn3jrg5grjgof0pv7f69liigm' // CognitoUserPoolClientId の値
  },
  API: {
    endpoints: [
      {
        name: 'tripyAPI',
        endpoint: 'https://dgas8tdbkc.execute-api.ap-northeast-1.amazonaws.com/dev' // ServiceEndpoint の値
      }
    ]
  }
});

const App = () => {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <Router>
          <div style={{ minHeight: '100vh' }}>
            <Navigation signOut={signOut} user={user} />
            <div className="container">
              <Routes>
                <Route path="/" element={<Navigate to="/itinerary" />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/itinerary" element={<ItineraryPage />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/booking" element={<BookingPage />} />
                <Route path="/todo" element={<TodoPage />} />
              </Routes>
            </div>
          </div>
        </Router>
      )}
    </Authenticator>
  );
};

export default App;