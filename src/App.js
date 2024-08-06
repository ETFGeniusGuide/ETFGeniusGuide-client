import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchData = async() => {
      const res = await axios.get('http://localhost:8080/member');
      return res;
    }

    fetchData().then(res => setData(res));
  }, []);

  return (
      <div>
        {data.data}
      </div>
  )
}

export default App;
