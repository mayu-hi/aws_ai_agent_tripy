import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const ItineraryPage = () => {
  const [currentDay, setCurrentDay] = useState(1);
  const [animateCard, setAnimateCard] = useState(false);
  const navigate = useNavigate();

  const londonItinerary = {
    title: "ロンドン旅行",
    duration: "2泊3日",
    dates: "2024年3月15日 - 3月17日",
    days: [
      {
        day: 1,
        date: "3月15日（金）",
        theme: "到着・歴史探訪",
        activities: [
          { time: "07:00", activity: "羽田空港出発", location: "羽田空港", locationEn: "Haneda Airport", lat: 35.5494, lng: 139.7798, type: "transport" },
          { time: "12:30", activity: "ヒースロー空港到着", location: "ヒースロー空港", locationEn: "Heathrow Airport", lat: 51.4700, lng: -0.4543, type: "transport" },
          { time: "14:00", activity: "ホテルチェックイン", location: "The Zetter Hotel", locationEn: "The Zetter Hotel", lat: 51.5200, lng: -0.1000, type: "accommodation" },
          { time: "15:30", activity: "ロンドン塔見学", location: "ロンドン塔", locationEn: "Tower of London", lat: 51.5081, lng: -0.0759, type: "sightseeing" },
          { time: "17:30", activity: "タワーブリッジ散策", location: "タワーブリッジ", locationEn: "Tower Bridge", lat: 51.5055, lng: -0.0754, type: "sightseeing" },
          { time: "19:00", activity: "パブで夕食", location: "The George Inn", locationEn: "The George Inn", lat: 51.5045, lng: -0.0865, type: "dining" }
        ]
      },
      {
        day: 2,
        date: "3月16日（土）",
        theme: "王室・文化体験",
        activities: [
          { time: "08:00", activity: "ホテルで朝食", location: "The Zetter Hotel", locationEn: "The Zetter Hotel", lat: 51.5200, lng: -0.1000, type: "dining" },
          { time: "09:30", activity: "バッキンガム宮殿見学", location: "バッキンガム宮殿", locationEn: "Buckingham Palace", lat: 51.5014, lng: -0.1419, type: "sightseeing" },
          { time: "11:00", activity: "衛兵交代式見学", location: "バッキンガム宮殿", locationEn: "Buckingham Palace", lat: 51.5014, lng: -0.1419, type: "sightseeing" },
          { time: "13:00", activity: "アフタヌーンティー", location: "Fortnum & Mason", locationEn: "Fortnum & Mason", lat: 51.5074, lng: -0.1372, type: "dining" },
          { time: "15:00", activity: "大英博物館見学", location: "大英博物館", locationEn: "British Museum", lat: 51.5194, lng: -0.1270, type: "sightseeing" },
          { time: "18:00", activity: "コヴェントガーデン散策", location: "コヴェントガーデン", locationEn: "Covent Garden", lat: 51.5118, lng: -0.1226, type: "shopping" },
          { time: "20:00", activity: "ミュージカル鑑賞", location: "ウエストエンド", locationEn: "West End", lat: 51.5130, lng: -0.1347, type: "entertainment" }
        ]
      },
      {
        day: 3,
        date: "3月17日（日）",
        theme: "最終日・ショッピング",
        activities: [
          { time: "09:00", activity: "ホテルで朝食", location: "The Zetter Hotel", locationEn: "The Zetter Hotel", lat: 51.5200, lng: -0.1000, type: "dining" },
          { time: "10:30", activity: "ウェストミンスター寺院", location: "ウェストミンスター寺院", locationEn: "Westminster Abbey", lat: 51.4994, lng: -0.1273, type: "sightseeing" },
          { time: "12:00", activity: "ビッグベン・国会議事堂", location: "ウェストミンスター", locationEn: "Westminster", lat: 51.4994, lng: -0.1245, type: "sightseeing" },
          { time: "14:00", activity: "オックスフォード街でショッピング", location: "オックスフォード街", locationEn: "Oxford Street", lat: 51.5154, lng: -0.1447, type: "shopping" },
          { time: "16:00", activity: "ホテルチェックアウト", location: "The Zetter Hotel", locationEn: "The Zetter Hotel", lat: 51.5200, lng: -0.1000, type: "accommodation" },
          { time: "17:30", activity: "ヒースロー空港へ", location: "ヒースロー空港", locationEn: "Heathrow Airport", lat: 51.4700, lng: -0.4543, type: "transport" },
          { time: "21:00", activity: "ロンドン出発", location: "ヒースロー空港", locationEn: "Heathrow Airport", lat: 51.4700, lng: -0.4543, type: "transport" }
        ]
      }
    ]
  };

  useEffect(() => {
    setAnimateCard(true);
    const timer = setTimeout(() => setAnimateCard(false), 500);
    return () => clearTimeout(timer);
  }, [currentDay]);

  const getActivityColor = (type) => {
    const colors = {
      transport: "#FFF5F7",
      accommodation: "#FFE8ED",
      sightseeing: "#FDF2F8",
      dining: "#FFF8F8",
      shopping: "#FFFAFC",
      entertainment: "#F8F6FF"
    };
    return colors[type] || "#F8F9FA";
  };

  const handleLocationClick = (activity) => {
    if (activity.lat && activity.lng) {
      navigate('/map', { 
        state: { 
          center: [activity.lat, activity.lng], 
          locationName: activity.location,
          locationNameEn: activity.locationEn
        } 
      });
    }
  };

  return (
    <div className="card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ 
          color: '#8B1538', 
          fontSize: '36px', 
          fontWeight: '700', 
          letterSpacing: '2px',
          marginBottom: '10px',
          textShadow: '2px 2px 4px rgba(139, 21, 56, 0.1)'
        }}>
          {londonItinerary.title}
        </h1>
        <p style={{ 
          color: '#D4526A', 
          fontSize: '18px', 
          fontWeight: '600',
          marginBottom: '5px'
        }}>
          {londonItinerary.duration}
        </p>
        <p style={{ color: '#8B1538', fontSize: '16px', fontWeight: '500' }}>
          {londonItinerary.dates}
        </p>
      </div>

      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        marginBottom: '30px',
        gap: '10px'
      }}>
        {londonItinerary.days.map((day) => (
          <button
            key={day.day}
            onClick={() => setCurrentDay(day.day)}
            className="btn"
            style={{
              backgroundColor: currentDay === day.day ? '#FDF2F8' : '#FFEEF2',
              color: currentDay === day.day ? '#8B1538' : '#D4526A',
              border: '2px solid #FDF2F8',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              transform: currentDay === day.day ? 'scale(1.05)' : 'scale(1)',
              transition: 'all 0.3s ease'
            }}
          >
            Day {day.day}
          </button>
        ))}
      </div>

      <div 
        className={animateCard ? 'animate-slide-in' : ''}
        style={{
          background: 'linear-gradient(135deg, #F8BBD9 0%, #FFFFFF 100%)',
          borderRadius: '20px',
          padding: '30px',
          boxShadow: '0 10px 30px rgba(139, 21, 56, 0.1)',
          transition: 'all 0.5s ease'
        }}
      >
        {londonItinerary.days
          .filter(day => day.day === currentDay)
          .map(day => (
            <div key={day.day}>
              <div style={{ textAlign: 'center', marginBottom: '25px' }}>
                <h2 style={{ 
                  color: '#8B1538', 
                  fontSize: '28px', 
                  fontWeight: '700',
                  marginBottom: '5px'
                }}>
                  {day.date}
                </h2>
                <p style={{ 
                  color: '#D4526A', 
                  fontSize: '18px', 
                  fontWeight: '600',
                  fontStyle: 'italic'
                }}>
                  {day.theme}
                </p>
              </div>

              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute',
                  left: '30px',
                  top: '0',
                  bottom: '0',
                  width: '3px',
                  background: 'linear-gradient(to bottom, #8B1538, #D4526A)',
                  borderRadius: '2px'
                }} />

                {day.activities.map((activity, index) => (
                  <div 
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: '20px',
                      position: 'relative',
                      paddingLeft: '70px',
                      animation: `fadeInUp 0.6s ease ${index * 0.1}s both`
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      left: '18px',
                      width: '24px',
                      height: '24px',
                      backgroundColor: '#8B1538',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 8px rgba(139, 21, 56, 0.3)'
                    }}>
                      {index + 1}
                    </div>

                    <div style={{
                      backgroundColor: getActivityColor(activity.type),
                      borderRadius: '15px',
                      padding: '15px 20px',
                      flex: 1,
                      border: '1px solid rgba(139, 21, 56, 0.05)',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 8px 25px rgba(139, 21, 56, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = 'none';
                    }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{
                          backgroundColor: '#8B1538',
                          color: 'white',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          fontSize: '14px',
                          fontWeight: '600',
                          minWidth: '60px',
                          textAlign: 'center'
                        }}>
                          {activity.time}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ 
                            color: '#8B1538', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            marginBottom: '5px'
                          }}>
                            {activity.activity}
                          </h4>
                          <p 
                            style={{ 
                              color: '#D4526A', 
                              fontSize: '14px', 
                              fontWeight: '500',
                              margin: 0,
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                            onClick={() => handleLocationClick(activity)}
                          >
                            {activity.location} {activity.locationEn && `(${activity.locationEn})`}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default ItineraryPage;