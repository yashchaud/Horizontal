import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@ui/button";
import background from "@/components/images/discordbackground.svg";
import logo from "@/components/images/discordlogologin.svg";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { setUserinfo } from "../../Redux/sessionSlice";
import { useQueryClient } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import axios from "axios";
import styled from "styled-components";
import Cookies from "js-cookie";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState("");
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const [Currentwidth, setCurrentwidth] = useState(window.innerWidth);

  useEffect(() => {
    toast.message("You can Sign Up or use this test account ", {
      description: "Email: test@gmail.com, password: test",
      duration: 3500,
    });
    const handleResize = () => {
      setCurrentwidth(window.innerWidth);
      console.log(Currentwidth);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [window.innerWidth, Currentwidth]);

  const handleEmailChange = (event) => {
    setEmail(event.target.value);
  };
  const handleusernameChange = (event) => {
    setUsername(event.target.value);
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
  };

  const handleSubmit = (event) => {
    console.log("Inside");
    event.preventDefault();

    axios
      .post(
        "/api/users/user/login",
        {
          email,
          password: password,
        },
        {
          withCredentials: true, // Important for cookies
        }
      )
      .then(function (response) {
        console.log(response);
        dispatch(setUserinfo(response.data.user));
        toast.success("Login Successful, Welcome Back", {
          duration: 2000,
          style: {
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            border: "none",
            filter: "drop-shadow(0px 0px 3px #151617)",
            dropshadow: "1px 1px 1px rgba(0, 0, 0, 0.5)",
            backgroundImage:
              "radial-gradient( circle 100px at -1.4% 14%,  #66ffad4b 0%, #27292c 90% )",
          },
          position: "bottom-right",
        });
        // Save the user in the local storage
        localStorage.setItem("user", JSON.stringify(response.data.user));

        if (Currentwidth < 768) {
          navigate("/@me");
        } else {
          navigate("/@me");
        }

        setEmail("");
        setPassword("");
      })
      .catch(function (error) {
        console.log(error);
        toast.error("Wrong Password or Email", {
          style: {
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            border: "none",
            filter: "drop-shadow(0px 0px 3px #151617)",
            dropshadow: "1px 1px 1px rgba(0, 0, 0, 0.5)",
            backgroundImage:
              "radial-gradient( circle 100px at -1.4% 14%,  #fc51518a 0%, #27292c 90% )",
          },
          position: "top-right",
          duration: 2000,
        });
      });
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen bg-[#5865F2]"
      style={{
        backgroundImage: `url(${background})`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        minWidth: "100vw",
        height: "100vh",
      }}
    >
      <div className="absolute top-8 left-8 flex items-center space-x-1">
        <div className="w-2 h-14 text-white" />
        <img src={logo} className="h-6" alt="Brand Logo" />
        {/* <img src={logoName} className="h-7" alt="Brand Name" /> */}
      </div>
      <div className="w-full h-full max-w-md p-8 bg-[#313338] rounded-none shadow-lg md:rounded-md md:h-auto md:max-w-lg  max-md:min-w-[100vw]">
        <div className="text-center max-md:mt-[5rem]">
          <h2 className="mb-1 text-2xl font-bold text-white">Welcome back!</h2>
          <p className="text-base font text-gray-400">
            We're so excited to see you again!
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="text-xs font-bold text-gray-300 mr-2"
            >
              EMAIL OR PHONE NUMBER
            </label>
            <label style={{ color: "red" }}>*</label>
            <input
              id="email"
              onChange={(e) => setEmail(e.target.value)}
              type="text"
              className="w-full p-1.5 bg-[#1E1F22] border-none border-transparent focus:outline-none focus:border-transparent rounded-sm text-white"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="password"
              className="text-xs font-bold text-gray-300 mr-2"
            >
              PASSWORD
            </label>
            <label style={{ color: "red" }}>*</label>
            <input
              id="password"
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full p-1.5 bg-[#1E1F22] border-none border-transparent focus:outline-none focus:border-transparent rounded-sm text-white"
            />
            <a href="#" className="text-sm text-[#00AFF4] block mt-1">
              Forgot your password?
            </a>
          </div>
          <div>
            <button
              className="w-full py-2 bg-[#5865F2] text-white rounded-sm"
              style={{ backgroundColor: "#5865F2" }}
            >
              Log In
            </button>
            <div className="mt-2 text-sm text-gray-400">
              Need an account?{" "}
              <Link to="/register" className="text-[#00AFF4]">
                Register
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;

const Cover = styled.div`
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  .container {
    @media (max-width: 768px) {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-direction: column;
    }
  }
`;
