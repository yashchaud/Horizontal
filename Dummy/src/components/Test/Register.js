import React from "react";
import { Link } from "react-router-dom";
import background from "@/components/images/discordbackground.svg";
import logo from "@/components/images/discordlogologin.svg";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useDispatch } from "react-redux";
import { setUserinfo } from "../../Redux/sessionSlice";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const Register = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const schema = z.object({
    email: z.string().email("Invalid email address"),
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    month: z.string().min(1, "Month is required"),
    day: z.string().min(1, "Day is required"),
    year: z.string().min(1, "Year is required"),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
  });

  const handleregister = (data) => {
    axios
      .post(
        "/api/users/user/register",
        {
          username: data.username,
          email: data.email,
          password: data.password,
        },
        {
          withCredentials: true, // Important for cookies
        }
      )
      .then(function (response) {
        console.log(response);
        toast.success("Registration Successful, Welcome", {
          duration: 1000,
          style: {
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            border: "none",
            filter: "drop-shadow(0px 0px 3px #151617)",
            dropshadow: "1px 1px 1px rgba(0, 0, 0, 0.5)",
            backgroundImage:
              "radial-gradient( circle 100px at -1.4% 14%,  #66ffad4b 0%, #27292c 90% )",
          },
          position: "top-right",
        });
        navigate("/channel");
        setEmail("");
        setPassword("");
        setUsername("");
        return;
      })
      .catch(function (error) {
        console.log(error);
        if (error.response.status === 400 || error.response.status === 500) {
          toast.error("User Already Exists", {
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
        }
      });
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen bg-[#5865F2]"
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
      </div>
      <div
        className="w-full p-8 bg-[#313338] rounded-md shadow-lg"
        style={{ width: "480px", height: "700px" }}
      >
        <div className="text-center">
          <h2 className="mb-4 text-2xl font-bold text-white">
            Create an account
          </h2>
        </div>
        <form onSubmit={handleSubmit(handleregister)} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-xs font-bold text-slate-300 mr-2"
            >
              EMAIL
            </label>
            <label style={{ color: "red" }}>*</label>
            <input
              id="email"
              type="text"
              placeholder="Email"
              {...register("email")}
              className={`w-full p-2 bg-[#1E1F22] border-none focus:outline-none rounded-sm text-white ${
                errors.email
                  ? "border-2 border-gradient-to-r from-yellow-400 via-red-500 to-pink-500 border-"
                  : ""
              }`}
            />
            {errors.email && (
              <span className="text-red-500 text-xs">
                {errors.email.message}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <label
              htmlFor="username"
              className="text-xs font-bold text-slate-300 mr-2"
            >
              USERNAME
            </label>
            <label style={{ color: "red" }}>*</label>
            <input
              id="username"
              type="text"
              {...register("username")}
              className={`w-full p-2 bg-[#1E1F22] border-none focus:outline-none rounded-sm text-white ${
                errors.username
                  ? "border-2 border-gradient-to-r from-yellow-400 via-red-500 to-pink-500"
                  : ""
              }`}
            />
            {errors.username && (
              <span className="text-red-500 text-xs">
                {errors.username.message}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-xs font-bold text-slate-300 mr-2"
            >
              PASSWORD
            </label>
            <label style={{ color: "red" }}>*</label>
            <input
              id="password"
              type="password"
              {...register("password")}
              className={`w-full p-2 bg-[#1E1F22] border-none focus:outline-none rounded-sm text-white ${
                errors.password
                  ? "border-2 border-gradient-to-r from-yellow-400 via-red-500 to-pink-500"
                  : ""
              }`}
            />
            {errors.password && (
              <span className="text-red-500 text-xs">
                {errors.password.message}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 mr-2">
              DATE OF BIRTH
            </label>
            <label style={{ color: "red" }}>*</label>
            <div className="flex space-x-2">
              <select
                name="month"
                {...register("month")}
                className={`w-1/3 pl-2 bg-[#1E1F22] border-none rounded-sm text-[#80868E] ${
                  errors.month
                    ? "border-2 border-gradient-to-r from-yellow-400 via-red-500 to-pink-500"
                    : ""
                }`}
              >
                <option value="">Month</option>
                <option value="1">January</option>
                <option value="2">February</option>
                <option value="3">March</option>
                <option value="4">April</option>
                <option value="5">May</option>
                <option value="6">June</option>
                <option value="7">July</option>
                <option value="8">August</option>
                <option value="9">September</option>
                <option value="10">October</option>
                <option value="11">November</option>
                <option value="12">December</option>
              </select>

              <select
                name="day"
                {...register("day")}
                className={`w-1/3 p-2 bg-[#1E1F22] border-none rounded-sm text-[#80868E] ${
                  errors.day
                    ? "border-2 border-gradient-to-r from-yellow-400 via-red-500 to-pink-500"
                    : ""
                }`}
              >
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>

              <select
                name="year"
                {...register("year")}
                className={`w-1/3 p-2 bg-[#1E1F22] border-none rounded-sm text-[#80868E] ${
                  errors.year
                    ? "border-2 border-gradient-to-r from-yellow-400 via-red-500 to-pink-500"
                    : ""
                }`}
              >
                <option value="">Year</option>
                {Array.from({ length: 100 }, (_, i) => (
                  <option key={i} value={2024 - i}>
                    {2024 - i}
                  </option>
                ))}
              </select>
            </div>
            {(errors.month || errors.day || errors.year) && (
              <span className="text-red-500 text-xs">
                {errors.month?.message ||
                  errors.day?.message ||
                  errors.year?.message}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-start text-[11.5px] text-gray-400">
            <label className="flex items-start mt-1.5">
              <input
                type="checkbox"
                id="discordUpdates"
                className="h-6 w-9 appearance-none border-2 border-gray-400 rounded-md bg-transparent focus:ring-[#5865F2] checked:bg-[#5865F2] checked:border-transparent relative"
              />
              <span className="ml-3 text-gray-400 text-[11.5px] leading-tight">
                (Optional) It's okay to send me some emails with Discord
                updates, tips, and special offers. You can opt out at any time.
              </span>

              <style jsx>{`
                input[type="checkbox"]:checked::before {
                  content: "✔";
                  font-size: 14px;
                  color: white;
                  position: absolute;
                  top: 50%;
                  left: 50%;
                  transform: translate(-50%, -50%);
                }
              `}</style>
            </label>
          </div>
          <div>
            <button
              type="submit"
              className="w-full py-2 bg-[#5865F2] text-white rounded-sm"
              style={{ backgroundColor: "#5865F2" }}
            >
              Register
            </button>
            <div className="mt-2 text-gray-400 text-[11px] leading-tight">
              By registering, you agree to Discord's{" "}
              <Link to="/" className="text-[#00AFF4]">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/" className="text-[#00AFF4]">
                Privacy Policy
              </Link>
              .
            </div>
            <div className="mt-4 text-sm text-gray-400">
              <Link to="/" className="text-[#00AFF4]">
                Already have an account?
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
