import React, { useState, useRef, useEffect } from "react";
import styled from "styled-components";
import cross from "@images/X.svg";
import keys from "@images/keys.svg";
import axios from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { setcreateserver } from "@Redux/sessionSlice";
import {
  settogglesidebar,
  setInviteLinkOpen,
  setInviteLink,
} from "@Redux/sessionSlice";
import { useDispatch, useSelector } from "react-redux";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Button } from "@ui/button";

const CreateCategory = () => {
  const queryClient = useQueryClient();
  const [isopen, setisopen] = useState(false);
  const [CategoryName, SetcategoryName] = useState("");
  const [Copied, setCopied] = useState(false);
  const dispatch = useDispatch();
  const { id } = useParams();

  const { InviteLinkOpen, InviteLink } = useSelector(
    (state) => state.counterSlice
  );

  const container = useRef();
  useEffect(() => {
    console.log("InviteLinkOpen", InviteLinkOpen);
    const GenerateInvite = async () => {
      const response = await axios
        .get(`/api/server/servers/${id}/invite`)
        .then((response) => {
          console.log(response);
          const inviteLink = response.data.inviteLink;
          dispatch(setInviteLink(inviteLink));
          dispatch(setInviteLinkOpen(true));
        });
      // console.log("INvite Link", response.data);
      // const inviteLink = response.data.inviteLink;
      // dispatch(setInviteLink(inviteLink));
      // dispatch(setInviteLinkOpen(true));
    };
    if (InviteLinkOpen === true) {
      GenerateInvite();
    }
  }, [InviteLinkOpen]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`https://discord.gg/${InviteLink}`);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    InviteLinkOpen && (
      <Cover ref={container} onClick={() => dispatch(setInviteLinkOpen(false))}>
        <Maincontainer className="Mainas" onClick={(e) => e.stopPropagation()}>
          <div>
            <div className="cross">
              <img
                onClick={() => {
                  dispatch(settogglesidebar(true));
                  dispatch(setInviteLinkOpen(false));
                }}
                src={cross}
                alt=""
              />
            </div>
          </div>
          <div>
            <p className="text-lg text-gray-100 align-center ml-6">
              Your Invite Link!
            </p>
          </div>
          <div className="flex justify-center items-center gap-2 w-full mb-6">
            <div className="w-full ml-4 mr-4 text-center align-center flex justify-between items-center bg-[#1e1e1e] rounded-md cursor-pointer p-2">
              <p className="text-lg font-bold text-slate-200 ">{`https://discord.gg/${InviteLink}`}</p>
              <Button
                variants="ghost"
                className={
                  Copied
                    ? "bg-green-700 text-black ml-2 hover:bg-green-700  "
                    : " bg-[#5865f2] text-white ml-2 hover:bg-[#5865f2be] hover:text-white"
                }
                onClick={copyToClipboard}
              >
                {Copied ? (
                  <p className="text-lg font-bold text-slate-200  transition-all rounded-md ">
                    Copied!
                  </p>
                ) : (
                  <p className="text-lg font-bold text-slate-200 transition-all">
                    Copy
                  </p>
                )}
              </Button>
            </div>
          </div>
        </Maincontainer>
      </Cover>
    )
  );
};

export default CreateCategory;
const Cover = styled.div`
  width: 100vw;
  height: 100vh;
  background-color: #0e0f10ad;
  position: absolute;
  top: 0;
  z-index: 22222222222222222222;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
`;
const Maincontainer = styled.div`
  width: 30rem;
  height: 10rem;
  background-color: #313338;
  border-radius: 0.5rem;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  @media (max-width: 770px) {
    width: 100%;
    height: 100%;
  }
  .cross {
    position: absolute;
    top: 1rem;
    right: 1rem;
    img {
      width: 2rem;
    }
  }
  .Dummy {
    padding: 1rem;
  }
  .title {
    width: 90%;
    margin-top: 1.5rem;
    display: flex;
    flex-direction: column;
    margin-left: 1rem;
    h1 {
      font-size: 1.55rem;
      margin-bottom: 0.5rem;
      color: white;
      font-weight: bold;
    }
    p {
      color: #b5bac1;
    }
  }
  .Servername {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: #ffffffb1;
    .Invite {
      font-size: 0.8rem;
      font-weight: bold;
      font-family: "cabin" sans-serif;
    }
    p {
      font-size: 1rem;
      font-weight: bold;
      font-family: "cabin" sans-serif;
    }
    input {
      width: 100%;
      height: 2.2rem;
      padding: 0.5rem 0.5rem;
      border: none;
      border-radius: 0.3rem;
      background-color: #1e1f22;
      color: white;
    }
  }
  .bottomdiv {
    width: 100%;
    height: 5rem;
    display: flex;
    justify-content: flex-end;
    gap: 2rem;
    align-items: center;
    padding: 0 1rem;
    background-color: #2b2d31;
    border-bottom-left-radius: 0.5rem;
    border-bottom-right-radius: 0.5rem;
    p {
      color: #b5bac1;
      font-weight: bold;
      font-family: "cabin" sans-serif;
      margin-left: 1rem;
      cursor: pointer;
    }
    button {
      height: 2.5rem;
      background-color: #5865f2;
      color: white;
      padding: 0.4rem 1rem;
      border: none;
      padding-inline: 1rem;
      border-radius: 0.2rem;
      font-weight: bold;
      font-family: "cabin" sans-serif;
      cursor: pointer;
      margin-right: 1rem;
    }
  }
`;
