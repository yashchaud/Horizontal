import React, { useState, useEffect, useRef } from "react";
import Photo from "@/components/images/nike-just-do-it (2).png";
import Profilephoto from "../userprofile/profilephoto";
import KingSvg from "./KingSvg.svg";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import styled from "styled-components"; // Import styled-components

const SvgKing = ({ w, d }) => {
  return (
    <svg
      aria-label="Server Owner"
      class="ownerIcon_a31c43 icon_a31c43"
      aria-hidden="false"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      width={w}
      height={d}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        fill="#f0b132"
        d="M5 18a1 1 0 0 0-1 1 3 3 0 0 0 3 3h10a3 3 0 0 0 3-3 1 1 0 0 0-1-1H5ZM3.04 7.76a1 1 0 0 0-1.52 1.15l2.25 6.42a1 1 0 0 0 .94.67h14.55a1 1 0 0 0 .95-.71l1.94-6.45a1 1 0 0 0-1.55-1.1l-4.11 3-3.55-5.33.82-.82a.83.83 0 0 0 0-1.18l-1.17-1.17a.83.83 0 0 0-1.18 0l-1.17 1.17a.83.83 0 0 0 0 1.18l.82.82-3.61 5.42-4.41-3.07Z"
        class=""
      ></path>
    </svg>
  );
};

const MembersTab = () => {
  const container = useRef();
  const dispatch = useDispatch();
  const [members, setMembers] = useState([]);
  const { toggleMemberstab } = useSelector((state) => state.counterSlice);
  const { id, channelId } = useParams();

  const FetchServerMembers = async () => {
    try {
      const response = await axios.get(`/api/server/servers/${id}`);
      setMembers(response.data);
    } catch (error) {
      console.error("Error fetching server members:", error);
    }
  };

  useEffect(() => {
    FetchServerMembers();
  }, [channelId]);

  useGSAP(
    () => {
      const animation = gsap.fromTo(
        container.current,
        { translateX: -10 },
        { translateX: 0, ease: "Power2.out", duration: 0.3 }
      );
    },
    { scope: container, dependencies: [] }
  );
  return (
    <div
      ref={container}
      className="w-[18%] h-full flex flex-col justify-between p-2 bg-[#2b2d31] sticky top-0 z-[2222222222222222222222222]"
    >
      <div className="w-full h-full flex flex-col  items-center gap-2">
        <h1 className="w-[95%] text-[#b5bac1] text-sm mt-4 ml-2 mb-2">
          OFFLINE -
        </h1>
        <div className="w-full items-center justify-centerflex flex-col gap-2">
          <div className=" bg-[#2b2d31] w-full hover:bg-[#313338] h-[2.7rem] flex  items-center gap-4 rounded-sm cursor-pointer hover:text-white">
            <div className="h-8 w-8 rounded-full ml-2 bg-white flex justify-center items-center">
              <Profilephoto className="w-6 h-6  rounded-full self-center" />
            </div>
            <div className="flex   justify-center items-center gap-[5px] hover:text-white">
              <TextStyled className="text-[#b5bac1] text-md">
                {members?.owner?.username}
              </TextStyled>
              <SvgKing w={15} d={20} />
            </div>
          </div>
          {members?.members
            ?.filter((member) => member.username !== members?.owner?.username)
            .map((member, index) => {
              return (
                <div
                  key={index}
                  className="  bg-[#2b2d31] hover:bg-[#313338] w-full h-[2.7rem] gap-4 flex  items-center  rounded-sm cursor-pointer mt-1 gap-1"
                >
                  <div className="h-8 w-8 rounded-full ml-2 bg-white flex justify-center items-center">
                    <Profilephoto className="w-6 h-6  rounded-full self-center" />
                  </div>
                  <div className="flex   justify-center items-center gap-[5px]">
                    <TextStyled className="text-[#b5bac1] text-md">
                      {member.username}
                    </TextStyled>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default MembersTab;

const TextStyled = styled.h1`
  max-width: 9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;
const Container = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
`;

const MemberCard = styled.div`
  background-color: #2b2d31;
  width: 45%;
  height: 2.7rem;
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 0.25rem;
  cursor: pointer;
  margin-top: 0.5rem;
  &:hover {
    background-color: #313338;
    color: white;
  }
`;

const ProfileContainer = styled.div`
  height: 2rem;
  width: 2rem;
  border-radius: 50%;
  background-color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-left: 0.5rem;
`;

const UsernameContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
`;
