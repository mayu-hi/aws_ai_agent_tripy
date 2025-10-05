import React, { useState } from 'react';
import axios from 'axios';

const ChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post('/api/trips/chat', {
        message: input,
        tripContext: {}
      });

      const aiMessage = { role: 'assistant', content: response.data.response };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage = { role: 'assistant', content: 'エラーが発生しました。もう一度お試しください。' };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const messagesStyle = {
    height: '450px',
    overflowY: 'auto',
    padding: '20px',
    marginBottom: '20px',
    background: '#fafbfc',
    borderRadius: '15px',
    border: '2px solid #e1e8ed'
  };

  return (
    <div className="card">
      <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#8B1538', fontSize: '32px', fontWeight: '700', letterSpacing: '1px' }}>
        旅行プランニングAI
      </h2>
      <div style={messagesStyle}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#8B1538', padding: '40px', fontSize: '18px', fontWeight: '500' }}>
            旅行について何でも聞いてください
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={message.role === 'user' ? 'message-user' : 'message-ai'}
          >
            {message.content}
          </div>
        ))}
        {loading && (
          <div className="message-ai">
            AIが考えています...
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="例: 東京で2日間の旅行プランを教えて！"
          className="input"
          style={{ flex: 1 }}
        />
        <button onClick={sendMessage} disabled={loading} className="btn">
          送信
        </button>
      </div>
    </div>
  );
};

export default ChatPage;