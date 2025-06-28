import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import background from "@/components/images/discordbackground.svg";
import logo from "@/components/images/discordlogologin.svg";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";

const Login = () => {
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleContinue = (event) => {
    event.preventDefault();
    // if (!displayName.trim()) {
    //   setError("Display Name is required.");
    //   return;
    // }
    // setError("");
    navigate("/");
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen bg-[#5865F2] "
      style={{
        backgroundImage: `url(${background})`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        width: "100vw",
        height: "100vh",
      }}
    >
      <div className="absolute top-8 left-8 flex items-center space-x-1">
        <div className="w-2 h-14 text-white" />
        <img src={logo} className="h-6" alt="Brand Logo" />
        {/* <img src={logoName} className="h-7" alt="Brand Name" /> */}
      </div>
      <div className="w-full max-w-md p-8 bg-[#313338] rounded-md shadow-lg max-sm:w-[100vw] max-sm:h-[100vh] max-sm:bg-[#1E1F22] max-sm:pt-24">
        <div className="flex flex-col items-center text-center">
          {/* <img src={Discordcircle} className="h-20 mb-4" alt="discordCircle" /> */}
          <Avatar className="w-20 h-20 mb-4">
            <AvatarImage
              src="https://bucket-88dwgz.s3.ap-south-1.amazonaws.com/bucket-88dwgz/Profilepicidsc.jpg"
              alt=""
            />
            <AvatarFallback>CN</AvatarFallback>
          </Avatar>
          <p className="text-base font-medium text-gray-400 mt-3">
            Discord invited you to join
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleContinue}>
          <div className="flex flex-col items-center text-center mb-4">
            <label
              htmlFor="email"
              className="text-2xl font-bold text-white flex flex-col items-center space-y-2"
            >
              <span>Discord's server</span>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="block w-3 h-3 rounded-full bg-green-500"></span>
                  <span className="text-gray-400 text-sm">222</span>
                  <span className="text-gray-400 text-sm">Online</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="block w-3 h-3 rounded-full bg-[#B5BAC1]"></span>
                  <span className="text-gray-400 text-sm">22</span>
                  <span className="text-gray-400 text-sm">Members</span>
                </div>
              </div>
            </label>
          </div>
          <div className="pt-4">
            <button
              type="submit"
              className="w-full py-2 bg-[#5865F2] text-white rounded-sm"
              style={{ backgroundColor: "#5865F2" }}
            >
              Accept invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
