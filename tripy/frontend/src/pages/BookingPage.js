import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BookingPage = () => {
  const [bookings, setBookings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    type: 'hotel',
    name: '',
    date: '',
    time: '',
    details: ''
  });

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const response = await axios.get('/api/bookings');
      setBookings(response.data);
    } catch (error) {
      console.error('予約の取得に失敗しました:', error);
    }
  };

  const createBooking = async () => {
    try {
      await axios.post('/api/bookings', formData);
      setFormData({ type: 'hotel', name: '', date: '', time: '', details: '' });
      setShowForm(false);
      fetchBookings();
    } catch (error) {
      console.error('予約の作成に失敗しました:', error);
    }
  };

  const deleteBooking = async (bookingId) => {
    try {
      await axios.delete(`/api/bookings/${bookingId}`);
      fetchBookings();
    } catch (error) {
      console.error('予約の削除に失敗しました:', error);
    }
  };

  const formStyle = {
    backgroundColor: '#fafbfc',
    padding: '25px',
    borderRadius: '15px',
    marginBottom: '25px',
    border: '2px solid #e1e8ed'
  };

  const bookingItemStyle = {
    border: '2px solid #e1e8ed',
    borderRadius: '15px',
    padding: '20px',
    marginBottom: '15px',
    backgroundColor: '#fafbfc'
  };

  return (
    <div className="card">
      <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#667eea', fontSize: '28px' }}>
        📅 予約管理
      </h2>
      
      <div style={{ textAlign: 'center', marginBottom: '25px' }}>
        <button onClick={() => setShowForm(!showForm)} className="btn">
          {showForm ? '❌ キャンセル' : '✨ 新しい予約'}
        </button>
      </div>

      {showForm && (
        <div style={formStyle}>
          <h3 style={{ color: '#667eea', marginBottom: '20px', textAlign: 'center' }}>
            🎆 新しい予約
          </h3>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            className="input"
            style={{ marginBottom: '15px' }}
          >
            <option value="hotel">🏨 ホテル</option>
            <option value="flight">✈️ 航空券</option>
            <option value="train">🚆 電車</option>
            <option value="restaurant">🍽️ レストラン</option>
            <option value="activity">🎭 アクティビティ</option>
          </select>
          
          <input
            type="text"
            placeholder="予約名"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="input"
            style={{ marginBottom: '15px' }}
          />
          
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="input"
            style={{ marginBottom: '15px' }}
          />
          
          <input
            type="time"
            value={formData.time}
            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
            className="input"
            style={{ marginBottom: '15px' }}
          />
          
          <textarea
            placeholder="詳細情報"
            value={formData.details}
            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
            className="input"
            style={{ height: '80px', marginBottom: '20px' }}
          />
          
          <div style={{ textAlign: 'center' }}>
            <button onClick={createBooking} className="btn">
              🎉 予約を作成
            </button>
          </div>
        </div>
      )}

      <h3 style={{ color: '#667eea', marginBottom: '20px' }}>
        📋 予約一覧
      </h3>
      {bookings.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
          🐱 まだ予約がありません。
        </div>
      ) : (
        bookings.map(booking => (
          <div key={booking.bookingId} style={bookingItemStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ color: '#667eea', marginBottom: '10px' }}>{booking.name}</h4>
                <p style={{ margin: '5px 0' }}><strong>🏷️ 種類:</strong> {booking.type}</p>
                <p style={{ margin: '5px 0' }}><strong>📅 日付:</strong> {booking.date} {booking.time}</p>
                <p style={{ margin: '5px 0' }}><strong>🟢 ステータス:</strong> {booking.status}</p>
                {booking.details && <p style={{ margin: '5px 0' }}><strong>📝 詳細:</strong> {booking.details}</p>}
              </div>
              <button
                onClick={() => deleteBooking(booking.bookingId)}
                className="btn btn-danger"
              >
                削除
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default BookingPage;