import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import UploadWidget from "./components/UploadWidget";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="container mx-auto max-w-72 flex flex-col items-center justify-center min-h-screen">
      <UploadWidget />
    </div>
  );
}

export default App;
