import React, { useEffect, useState, forwardRef } from "react";
import styled from "styled-components";
import { settogglesidebar } from "@Redux/sessionSlice";
import { useDispatch, useSelector } from "react-redux";
import Profilepage from "../userprofile/profilephoto";
import { Button } from "@ui/button";
import { gsap } from "gsap";
import axios from "axios";
import Tripledot from "../images/TripleDot.svg";

const Chatcomponents = forwardRef(
  ({ msgId, content, showHeader, msgcont, user, timestamp }, ref) => {
    const dispatch = useDispatch();
    const { togglesidebar, scrollToMessageId } = useSelector(
      (state) => state.counterSlice
    );
    const [userinfo, setuserinfo] = useState();

    const getTimeAgo = (timestamp) => {
      const now = new Date();
      const sentTime = new Date(timestamp);
      const diffInMs = now - sentTime;
      const diffInMin = Math.floor(diffInMs / (1000 * 60));

      if (diffInMin < 1) {
        return "Just now";
      } else if (diffInMin < 60) {
        return `${diffInMin} min ago`;
      } else if (diffInMin < 1440) {
        const diffInHours = Math.floor(diffInMin / 60); // Corrected calculation
        return `${diffInHours} ${diffInHours === 1 ? "hour" : "hours"} ago`;
      } else {
        return sentTime.toLocaleDateString();
      }
    };

    useEffect(() => {
      if (ref?.current) {
        if (msgId === scrollToMessageId) {
          gsap.fromTo(
            ref.current,
            { backgroundColor: "#313338", borderRadius: "10px" },
            {
              background: "#54626F",
              borderRadius: "10px",
              color: "black",
              duration: 0.7,
              ease: "power2.inOut",
              yoyo: true,
              repeat: 1,
            }
          );
        }
      }
    }, [scrollToMessageId, msgId, ref]);

    const handleclick = () => {
      if (window.innerWidth < 1024) {
        dispatch(settogglesidebar(false));
      }
    };

    return (
      <div className="relative">
        <Cover className="" ref={ref} onClick={handleclick}>
          <Profilepic>{showHeader && <Profilepage />}</Profilepic>
          <Text>
            {showHeader && (
              <Nametitle>
                <p className="text-[#fffff] font-bold">{user}</p>
                <p className="Time">{getTimeAgo(timestamp)}</p>
              </Nametitle>
            )}
            <Textcomponent>
              <p className="text-[#d5d5d5] font-medium text-md">{content}</p>
            </Textcomponent>
          </Text>
        </Cover>
        {/* <div className="absolute top-[-9px] right-6   rounded-[3px] pr-1 pl-1">
          <img
            src={Tripledot}
            alt="triple dot"
            className="w-6 h-6 cursor-pointer"
          />
        </div> */}
      </div>
    );
  }
);

export default Chatcomponents;

// Styled-components remain unchanged

const Cover = styled.div`
  width: 100%;
  min-height: 2rem;
  background-color: #313338;
  display: flex;
  padding: 1rem;
  padding-block: 0rem;
  gap: 0.5rem;
  position: relative;
  overflow-x: hidden;
  &:hover {
    background-color: #24242487;
    border-radius: 4px;
  }
`;

const Profilepic = styled.div`
  width: 2rem;
  height: 2rem;
`;
const Nametitle = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  color: #e7e7e7;

  .Time {
    font-size: 0.7rem;
    align-self: flex-end;
    color: #adadad;
  }
`;
const Text = styled.div`
  display: flex;
  width: 100%;
  flex-direction: column;
  color: #bbbbbb;
`;
const Textcomponent = styled.div`
  p {
    margin-block: 0.3rem;
    margin-left: 0.1rem;
  }
`;
