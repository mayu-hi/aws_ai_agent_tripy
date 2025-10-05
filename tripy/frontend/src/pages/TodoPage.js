import React, { useState, useEffect } from 'react';
import axios from 'axios';

const TodoPage = () => {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const response = await axios.get('/api/todos');
      setTodos(response.data);
    } catch (error) {
      console.error('TODOの取得に失敗しました:', error);
    }
  };

  const createTodo = async () => {
    if (!newTodo.trim()) return;
    
    try {
      await axios.post('/api/todos', { title: newTodo });
      setNewTodo('');
      fetchTodos();
    } catch (error) {
      console.error('TODOの作成に失敗しました:', error);
    }
  };

  const toggleTodo = async (todoId, completed) => {
    try {
      await axios.put(`/api/todos/${todoId}`, { completed: !completed });
      fetchTodos();
    } catch (error) {
      console.error('TODOの更新に失敗しました:', error);
    }
  };

  const deleteTodo = async (todoId) => {
    try {
      await axios.delete(`/api/todos/${todoId}`);
      fetchTodos();
    } catch (error) {
      console.error('TODOの削除に失敗しました:', error);
    }
  };

  const inputContainerStyle = {
    display: 'flex',
    marginBottom: '25px',
    gap: '10px'
  };

  const todoItemStyle = {
    display: 'flex',
    alignItems: 'center',
    padding: '15px',
    border: '2px solid #e1e8ed',
    borderRadius: '15px',
    marginBottom: '10px',
    backgroundColor: '#fafbfc',
    transition: 'all 0.3s ease'
  };

  const completedTodoStyle = {
    ...todoItemStyle,
    backgroundColor: '#e8f5e8',
    textDecoration: 'line-through',
    opacity: 0.7,
    borderColor: '#c8e6c9'
  };

  const checkboxStyle = {
    marginRight: '15px',
    transform: 'scale(1.3)',
    cursor: 'pointer'
  };

  return (
    <div className="card">
      <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#8B1538', fontSize: '32px', fontWeight: '700', letterSpacing: '1px' }}>
        旅行TODOリスト
      </h2>
      
      <div style={inputContainerStyle}>
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && createTodo()}
          placeholder="例: パスポートの有効期限を確認する"
          className="input"
          style={{ flex: 1 }}
        />
        <button onClick={createTodo} className="btn">
          追加
        </button>
      </div>

      <div>
        {todos.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#8B1538', padding: '40px', fontSize: '16px', fontWeight: '500' }}>
            TODOがありません。新しいTODOを追加してください。
          </div>
        ) : (
          todos.map(todo => (
            <div
              key={todo.todoId}
              style={todo.completed ? completedTodoStyle : todoItemStyle}
            >
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.todoId, todo.completed)}
                style={checkboxStyle}
              />
              <span style={{ flex: 1, fontSize: '16px' }}>{todo.title}</span>
              <button
                onClick={() => deleteTodo(todo.todoId)}
                className="btn btn-danger"
                style={{ fontSize: '12px', padding: '8px 12px' }}
              >
                削除
              </button>
            </div>
          ))
        )}
      </div>

      <div style={{ 
        marginTop: '25px', 
        padding: '15px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '15px', 
        textAlign: 'center',
        color: '#8B1538',
        fontWeight: '600'
      }}>
        完了: {todos.filter(t => t.completed).length} / 全体: {todos.length}
      </div>
    </div>
  );
};

export default TodoPage;