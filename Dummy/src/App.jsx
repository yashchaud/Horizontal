import React, { useState, useEffect } from "react";
import Homepage from "@Pages/Homepage";
import Serverbar from "@components/servers/Serverbar";
import Channelmaincover from "@components/channels/ChannelMaincover";
import GlobalStyle from "./Globalstyles";
import Useronlinepage from "@Pages/UserOnlinepage";
import Chatpage from "@Pages/Chatpage";
import { Route, Routes, Outlet, useLocation, Link } from "react-router-dom";
import { BrowserRouter } from "react-router-dom";
import { connectSocket } from "./socket";
import Login from "@components/Login/Login";
import Chatnavbar from "@components/chats/chatnavbar";
import styled from "styled-components";
import Threadpage from "@Pages/Threadpage";
import Createchannels from "@components/popups/Createchannel";
import Directsectionpage from "@Pages/Directsectionpage";
import { useDispatch } from "react-redux";
import { useSelector } from "react-redux";
import {
  setDirectmessage,
  settogglesidebar,
  setMessageFlag,
} from "@/Redux/sessionSlice";
import Messages from "@components/Mobilemessages/Messages";
import Usersection from "./Pages/Usersectionpage";
import messagea from "./components/images/messageas.svg";
import discordlogo from "./components/images/Discordlogo.svg";
import Swipeable from "./components/Helpers/Swipeable";
import { Toaster, toast } from "sonner";
import { setDropdownflag } from "@/Redux/sessionSlice";
import MobilePAge from "./Pages/MobilePAge";
import InviteLinkDialog from "./components/popups/InviteLinkDialog";
import "./globals.css";
import { current } from "@reduxjs/toolkit";
import debounce from "lodash.debounce";
import { Button } from "@ui/button";
import { useNavigate } from "react-router-dom";
import Test from "./components/Test/Test";
import Register from "./components/Test/Register";
import InvitePage from "./components/InviteLink/InvitePage";
import Editprofile from "./components/EditProfile/Editprofile";
import StreamingPage from "./components/Streaming/StreamingPage"

// import { connectSocketNotification, getNotificationSocket } from "./socket";
import Cookie from "js-cookie";
const App = () => {
  const user = Cookie.get("jwt");

  const navigate = useNavigate();
  const dispatch = useDispatch();
  const showNotification = debounce((message) => {
    toast.custom(
      (t) => (
        <div className="flex items-center gap-4 p-4 rounded-lg bg-background hover:bg-muted transition-colors  relative z-[321111111111111111112222222222222222222222222222222222222222222211111111111111111111] min-w-[300px] max-w-[700px]">
          <div className="flex-1 grid gap-1">
            <div className="flex items-center justify-between ">
              <div className="font-bold text-black">{message.Username}</div>
              <Button
                onClick={() => navigate(`/@me/${message.from}`)}
                variant="ghost"
                className="hover:bg-[#313338] hover:text-white"
              >
                Jump
              </Button>{" "}
            </div>
            <div className="flex  gap-2">
              <p className="text-sm text-muted-foreground line-clamp-2">
                {message.message}
              </p>
            </div>
          </div>
        </div>
      ),
      {
        duration: 3000, // 5 seconds
        style: {
          zIndex: "2234324234234233",
        },
      }
    );
  }, 500); // 1 second debounce
  const location = useLocation();

  const [currentWidth, setCurrentwidth] = useState(window.innerWidth);

  console.log(location.pathname);
  const path = location.pathname;

  useEffect(() => {
    const handleResize = () => {
      setCurrentwidth(window.innerWidth);
      console.log(currentWidth);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [window.innerWidth, currentWidth]);

  if (path.startsWith("/@me/") && path.split("/").length === 3) {
    dispatch(setDirectmessage(true));
  } else {
    dispatch(setDirectmessage(false));
  }
  useEffect(() => {
    connectSocket();

    toast(
      "You can swipe or click on server button to toggle between servers and messages",
      {
        duration: 600,
      }
    );
  }, []);
  const { createchannelflag } = useSelector((state) => state.counterSlice);
  const { togglesidebar, InviteLinkOpen } = useSelector(
    (state) => state.counterSlice
  );
  console.log(createchannelflag);
  const left = () => {
    dispatch(settogglesidebar(false));
  };
  const right = () => {
    dispatch(settogglesidebar(true));
  };
  useEffect(() => {
    if (currentWidth > 768) {
      dispatch(settogglesidebar(true));
    }
  }, [settogglesidebar, currentWidth]);

  //Notification logic
  // useEffect(() => {
  //   connectSocket();
  //   // connectSocketNotification();
  //   const notificationSocket = getNotificationSocket();
  //   notificationSocket.on(
  //     "new_notification",
  //     (message) => {
  //       // toast(message, { duration: 1000 });
  //       console.log(message);
  //       showNotification(message);
  //     },
  //     500
  //   );
  // }, []);

  return (
    <Swipeable
      styles={{ cursor: "grab" }}
      onSwipeRight={right}
      onSwipeLeft={left}
    >
      <Cover>
        <Toaster
          richColors
          position="top-center"
          theme="dark"
          closeButton="true"
        />
        <GlobalStyle />

        <Routes className="w-full">
          {/* <Route path="/" element={<Homepage />} /> */}
          <Route path="/" element={<Login />} />
          <Route exact path="/channel/" element={<Serverbar />}>
            <Route exact path=":id/" element={<Channelmaincover />}>
              <Route exact path=":channelId" element={<Chatpage />} />

              <Route
                exact
                path=":channelId/:threadId"
                element={<Threadpage />}
              />
            </Route>
          </Route>
          {currentWidth > 1024 && (
            <Route path="/@me" element={<Useronlinepage />}>
              <Route path=":userId" element={<Directsectionpage />} />
            </Route>
          )}
          <Route path="/@mobileme" element={<MobilePAge />} />
          <Route path="/@mobileme/:userId" element={<Usersection />} />
          <Route path="/@me" element={<Useronlinepage />} />
          <Route path="/@me/:userId" element={<Directsectionpage />} />
          <Route path="/tests" element={<Test />} />
          {/* <Route path="/@mobileme" element={<Messages />} />
          <Route path="/@mobileme/:userId" element={<Usersection />} /> */}
          <Route path="/register" element={<Register />} />
          <Route path="/invite" element={<InvitePage />} />.
          <Route path="/editprofile" element={<Editprofile />} />
          <Route path="/streaming" element={<StreamingPage />} />
        </Routes>

        <Outlet />
        {/* <Test/> */}
      </Cover>
      {/* <BottomDiv>
        <Link
          style={{ textDecoration: "none", color: "white" }}
          to="/channel"
          onClick={() => {
            dispatch(settogglesidebar(!togglesidebar));
          }}
        >
          <div className="message">
            <img src={discordlogo} alt="" />
            <p>Servers</p>
          </div>
        </Link>
        <Link style={{ textDecoration: "none" }} to="/@mobileme">
          <div className="message">
            <img src={messagea} alt="" />
            <p>Messages</p>
          </div>
        </Link>
      </BottomDiv> */}
    </Swipeable>
  );
};

export default App;

const Cover = styled.div`
  min-height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  min-width: 100vw;
  overflow-y: hidden;
  display: flex;
  background-color: #1e1f22;
`;
const BottomDiv = styled.div`
  width: 100vw;
  height: 4rem;
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  background-color: #3f4248;
  position: sticky;
  bottom: 0rem;
  z-index: 123333333333333;
  display: none;
  .message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    p {
      font-size: 0.8rem;
      font-weight: 600;
      color: #f6f6f6;
      font-family: "Cabin", sans-serif;
    }
  }
  @media (max-width: 758px) {
    display: flex;
  }
`;
