import React, { useEffect, useState, useRef } from "react";
import styled from "styled-components";
import plus from "../images/PlusDi.svg";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  setDropdownflag,
  setcreatechannelflag,
  setCategoryflag,
  settogglesidebar,
} from "@Redux/sessionSlice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@ui/dialog";
import { setInviteLink, setInviteLinkOpen } from "@/Redux/sessionSlice";

const Dropdownchannelcover = () => {
  const dispatch = useDispatch();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const container = useRef();
  const [currentWidth, setCurrentwidth] = useState(window.innerWidth);

  const CreateServerInvite = async () => {
    try {
      const response = await axios
        .get(`/api/server/servers/${id}/invite`)
        .then((response) => {
          const invite = response.data.inviteLink;
          dispatch(setInviteLink(invite));
          dispatch(setInviteLinkOpen(true));
        });
    } catch (error) {
      console.error("Error creating server invite:", error);
    }
  };

  const Deleteserver = async (id) => {
    try {
      const response = await axios.delete(`/api/server/servers/${id}`);
      console.log(response);
      queryClient.invalidateQueries({ queryKey: ["Serverlist"] });
    } catch (error) {
      console.error("Error deleting server:", error);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setCurrentwidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [window.innerWidth]);

  useGSAP(
    () => {
      const animation = gsap.fromTo(
        container.current,
        { translateY: -10 },
        { translateY: 0, ease: "Power2.out", duration: 0.2 }
      );
    },
    { scope: container, dependencies: [] }
  );

  const copyToClipboard = () => {
    navigator.clipboard.writeText(InviteLink);
    alert("Invite link copied to clipboard!");
  };

  return (
    <>
      <Cover ref={container}>
        <div
          onClick={() => {
            dispatch(setDropdownflag(false));
            dispatch(setcreatechannelflag(true));
            currentWidth < 768 && dispatch(settogglesidebar(false));
          }}
          className="dropdowndiv"
        >
          <p>Create channel</p>
          <div>
            <img src={plus} alt="" />
          </div>
        </div>
        <div
          onClick={() => {
            dispatch(setDropdownflag(false));
            dispatch(setCategoryflag(true));
            currentWidth < 768 && dispatch(settogglesidebar(false));
          }}
          className="dropdowndiv"
        >
          <p>Create Category</p>
          <div>
            <img src={plus} alt="" />
          </div>
        </div>
        <div
          onClick={() => CreateServerInvite()}
          style={{ cursor: "pointer", color: "#8d94ec" }}
          className="dropdowndiv"
        >
          <p>Create Server Invite</p>
          <div>
            <img src={plus} alt="" />
          </div>
        </div>
        <div
          onClick={() => Deleteserver(id)}
          style={{ cursor: "pointer", color: "red" }}
          className="dropdowndiv"
        >
          <p>Delete Server</p>
          <div>
            <img src={plus} alt="" />
          </div>
        </div>
      </Cover>
    </>
  );
};

export default Dropdownchannelcover;

const Cover = styled.div`
  width: 95%;
  position: absolute;
  bottom: -10.2rem;
  left: 0.5rem;
  display: flex;
  background-color: #111214;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 0.5rem;
  z-index: 2131232;
  gap: 0.3rem;
  border-radius: 0.4rem;

  .dropdowndiv {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-inline: 0.5rem;
    cursor: pointer;
    &:hover {
      background-color: #282a2e;
    }
    border-radius: 0.4rem;
    div {
      width: 2rem;
      height: 2rem;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 100%;
      img {
        width: 1.5rem;
        height: 1.5rem;
        color: white;
        cursor: pointer;
        border-radius: 100%;
      }
    }
  }
`;

const InviteLinkContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
`;

const InviteLinkText = styled.p`
  font-size: 1rem;
  word-break: break-all;
  background-color: #f4f4f4;
  padding: 0.5rem;
  border-radius: 0.3rem;
  width: 100%;
  text-align: center;
`;

const CopyButton = styled.button`
  padding: 0.5rem 1rem;
  background-color: #8d94ec;
  color: white;
  border: none;
  border-radius: 0.3rem;
  cursor: pointer;
  &:hover {
    background-color: #7c83db;
  }
`;
