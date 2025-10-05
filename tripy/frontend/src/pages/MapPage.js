import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { useLocation } from 'react-router-dom';
import L from 'leaflet';

// Leafletアイコンの修正
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MapPage = () => {
  const [pins, setPins] = useState([]);
  const [selectedPin, setSelectedPin] = useState(null);
  const [mapCenter, setMapCenter] = useState([35.6762, 139.6503]);
  const [mapZoom, setMapZoom] = useState(10);
  const location = useLocation();

  useEffect(() => {
    if (location.state?.center) {
      setMapCenter(location.state.center);
      setMapZoom(15);
      
      // 旅程表からの場所を自動的にピンとして追加
      const newPin = {
        id: Date.now(),
        lat: location.state.center[0],
        lng: location.state.center[1],
        name: location.state.locationName || '選択された場所',
        description: location.state.locationNameEn || ''
      };
      setPins(prev => [...prev, newPin]);
    }
  }, [location.state]);

  const MapClickHandler = () => {
    useMapEvents({
      click: (e) => {
        const newPin = {
          id: Date.now(),
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          name: `地点 ${pins.length + 1}`,
          description: '新しい観光地'
        };
        setPins(prev => [...prev, newPin]);
      }
    });
    return null;
  };

  const removePin = (id) => {
    setPins(prev => prev.filter(pin => pin.id !== id));
    setSelectedPin(null);
  };

  const updatePin = (id, updates) => {
    setPins(prev => prev.map(pin => pin.id === id ? { ...pin, ...updates } : pin));
  };

  const mapStyle = {
    height: '500px',
    width: '100%',
    borderRadius: '15px',
    overflow: 'hidden'
  };

  const pinItemStyle = {
    marginBottom: '15px',
    padding: '15px',
    backgroundColor: '#fafbfc',
    borderRadius: '15px',
    border: '2px solid #e1e8ed'
  };

  return (
    <div className="card">
      <h2 style={{ textAlign: 'center', marginBottom: '10px', color: '#8B1538', fontSize: '32px', fontWeight: '700', letterSpacing: '1px' }}>
        旅行マップ
      </h2>
      <p style={{ textAlign: 'center', marginBottom: '20px', color: '#8B1538', fontSize: '16px', fontWeight: '500' }}>
        地図をクリックして行きたい場所にピンを立てましょう
      </p>
      
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={mapStyle}
        key={`${mapCenter[0]}-${mapCenter[1]}`}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MapClickHandler />
        {pins.map(pin => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            eventHandlers={{
              click: () => setSelectedPin(pin)
            }}
          >
            <Popup>
              <div>
                <h4>{pin.name}</h4>
                <p>{pin.description}</p>
                <button onClick={() => removePin(pin.id)} className="btn btn-danger" style={{ fontSize: '12px', padding: '5px 10px' }}>
                  削除
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div style={{ marginTop: '20px' }}>
        <h3 style={{ color: '#8B1538', marginBottom: '15px', fontSize: '20px', fontWeight: '600' }}>
          ピン一覧 ({pins.length})
        </h3>
        {pins.map(pin => (
          <div key={pin.id} style={pinItemStyle}>
            <input
              type="text"
              value={pin.name}
              onChange={(e) => updatePin(pin.id, { name: e.target.value })}
              className="input"
              style={{ marginBottom: '10px' }}
            />
            <input
              type="text"
              value={pin.description}
              onChange={(e) => updatePin(pin.id, { description: e.target.value })}
              placeholder="説明を入力..."
              className="input"
            />
          </div>
        ))}
        {pins.length === 0 && (
          <div style={{ textAlign: 'center', color: '#8B1538', padding: '20px', fontSize: '16px', fontWeight: '500' }}>
            まだピンが設定されていません。地図をクリックしてピンを追加してください。
          </div>
        )}
      </div>
    </div>
  );
};

export default MapPage;