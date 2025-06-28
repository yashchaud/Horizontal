import React, { useEffect, useState, useRef } from "react";
import discordlogo from "../images/Discordlogo.svg";
import Nikeguy from "../images/nike-just-do-it (2).png";
import styled from "styled-components";
import Servers from "./Servers";
import plusicon from "../images/Plus.svg";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import { setMessage, setServers } from "../../Redux/sessionSlice";
import { Link, useNavigate, Outlet } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Createchannels from "@components/popups/Createchannel";
import Animatedsvg from "../chats/svga.svg";
import Profilepage from "../userprofile/profilepage";
import CreateServera from "../popups/CreateServer";
import { setcreateserver } from "@Redux/sessionSlice";
import CreateCategory from "../popups/CreateCategory";
import MobileServer from "../popups/MobileServer";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ui/tooltip";
import {
  settogglesidebar,
  setMessageFlag,
  setFriendTabFlag,
} from "@/Redux/sessionSlice";
import { useLocation } from "react-router-dom";
import InviteLinkDialog from "../popups/InviteLinkDialog";

const Serverbar = () => {
  axios.defaults.withCredentials = true;

  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { createchannelflag } = useSelector((state) => state.counterSlice);
  const { togglesidebar } = useSelector((state) => state.counterSlice);
  const { Directmessagetoggle, InviteLinkOpen, FriendTabFlag } = useSelector(
    (state) => state.counterSlice
  );
  const { MessageFlag } = useSelector((state) => state.counterSlice);
  const { Categoryflag } = useSelector((state) => state.counterSlice);
  const [currentWidth, setCurrentwidth] = useState(window.innerWidth);
  const [Localsidebar, setLocalsidebar] = useState(true);
  const Serverlogocontainer = useRef();
  const [selectedServer, setSelectedServer] = useState(null); // State for selected server
  const location = useLocation();

  const container = useRef();
  const fetchServer = async () => {
    try {
      const response = await axios.get("/api/server/servers");
      console.log(response);
      return response.data;
    } catch (error) {
      throw new Error("Error fetching server data: " + error.message);
    }
  };

  const queryClient = useQueryClient(); // Get the query client

  const { data, status } = useQuery({
    queryKey: ["Serverlist"],
    queryFn: fetchServer,
    onSuccess: (data) => {
      dispatch(setServers(data));
    },
    onError: (error) => {
      console.error("Error fetching server list:", error);
    },
  });

  // Handle loading and error states

  useEffect(() => {
    setCurrentwidth(window.innerWidth);
  }, [currentWidth, window.innerWidth]);

  useEffect(() => {
    setLocalsidebar(togglesidebar);
  }, [
    currentWidth,
    togglesidebar,
    Categoryflag,
    createchannelflag,
    MessageFlag,
  ]);

  useGSAP(
    () => {
      if (location.pathname === "/@me") {
        gsap.fromTo(
          Serverlogocontainer.current,
          { scale: 0.5, borderRadius: "2rem" },
          {
            scale: 1,
            borderRadius: "1rem",
            backgroundColor: "#5865f2",
            ease: "back.out(1.7)",
            duration: 0.5,
          }
        );
      }
    },
    { scope: container, dependencies: [location.pathname] }
  );

  return (
    <>
      {Localsidebar && (
        <Cover ref={container}>
          <div>
            {currentWidth < 769 && (
              <Link to={`/@me`}>
                <Logodiv onClick={() => dispatch(setMessageFlag(false))}>
                  <img src={discordlogo} alt="" />
                </Logodiv>
              </Link>
            )}
            {currentWidth > 769 && (
              <Link to={`/@me`}>
                <Logodiv ref={Serverlogocontainer}>
                  <img src={discordlogo} alt="" />
                </Logodiv>
              </Link>
            )}
          </div>
          <div>
            <Linedivider></Linedivider>
          </div>
          <ServerlistContainer>
            {data &&
              data.map((value, id) => (
                <div
                  onClick={() => {
                    dispatch(settogglesidebar(true));
                    setSelectedServer(value._id);
                  }}
                  key={id}
                >
                  <Link to={`/channel/${value._id}`}>
                    <Servers
                      value={value}
                      isSelected={selectedServer === value._id}
                    />
                  </Link>
                </div>
              ))}
          </ServerlistContainer>
          <div>
            <TooltipProvider delayDuration={0} skipDelayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Logodivv onClick={() => dispatch(setcreateserver(true))}>
                    <img src={plusicon} alt="" />
                  </Logodivv>
                </TooltipTrigger>
                <StyledTooltipContent side="right" sideOffset={10}>
                  <p>Create Server</p>
                </StyledTooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </Cover>
      )}

      {!Directmessagetoggle && <Outlet />}

      {createchannelflag && <Createchannels />}
      {InviteLinkOpen && <InviteLinkDialog />}

      <Profilepage />
      {currentWidth < 1024 ? <MobileServer /> : <CreateServera />}
      <CreateCategory />
    </>
  );
};

export default Serverbar;

const Cover = styled.div`
  width: 4.5rem;
  min-width: 4.5rem;
  height: 100vh;
  /* @media (max-width: 768px) {
    position: sticky;
  } */
  z-index: 4000;
  background-color: #1e1f22;
  display: flex;
  align-items: center;
  flex-direction: column;
  overflow-y: auto;
  &::-webkit-scrollbar {
    width: 1px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #1e1f22;
    border-radius: 10px;
  }

  &::-webkit-scrollbar-track {
    background-color: #1e1f22;
  }
`;
const Logodiv = styled.div`
  margin-top: 0.7rem;
  margin-bottom: 0.5rem;

  width: 3rem;
  height: 3rem;
  border-radius: 2rem;
  display: flex;
  justify-content: center;
  background-color: #313338;
  img {
    width: 63%;
  }
`;
const Logodivv = styled.div`
  margin-top: 0.7rem;
  margin-bottom: 0.5rem;

  width: 3rem;
  height: 3rem;
  border-radius: 2rem;
  display: flex;
  justify-content: center;
  background-color: #313338;
  @media (max-width: 450px) {
    margin-bottom: 10rem;
  }
  img {
    width: 63%;
  }
`;
const ServerlistContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;
const Linedivider = styled.div`
  width: 2rem;
  height: 0.1rem;
  background-color: #313338;
  margin-bottom: 0.5rem;
`;
const StyledTooltipContent = styled(TooltipContent)`
  background-color: #111111;
  color: #fff;
  padding-inline: 0.5rem;
  padding-block: 0.25rem;
  border-radius: 0.25rem;
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.1);
  font-size: 0.875rem;
  min-width: 10rem;
  text-align: start;
  display: flex;
  align-items: center;
  padding-left: 1.5rem;
  font-size: 1rem;
  min-height: 2.5rem;
  z-index: 5000; /* Ensure this is higher than the server bar */
`;
