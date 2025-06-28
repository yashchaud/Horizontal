import React from "react";
import profile from "../images/nike-just-do-it (2).png";
import styled from "styled-components";
import { setprofilediv } from "@Redux/sessionSlice";
import { useDispatch } from "react-redux";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import green from "../images/green.jpg";
import Invincible from "../images/invincible.svg";

const Profilephoto = ({ borderColor, borderWidth }) => {
  const dispatch = useDispatch();

  return (
    <>
      <Cover
        onClick={(event) => {
          event.stopPropagation();
          dispatch(setprofilediv(true));
        }}
      >
        <img
          className="Style"
          src="https://cdn.discordapp.com/avatar-decoration-presets/a_629689577fa1da2ef0061a5a8c930de1.png?size=240&passthrough=true"
          alt=""
        />
        <div>
          <img src={profile} alt="" className="ProfileImage" />

          <AvatarStyled borderColor={borderColor} borderWidth={borderWidth}>
            <AvatarImage src={green} alt="@shadcn" />
            <AvatarFallback>CN</AvatarFallback>
          </AvatarStyled>
          {/* <AvatarStyled borderColor={borderColor} borderWidth={borderWidth}>
            <AvatarImage
              className="w-full h-full"
              src={Invincible}
              alt="@shadcn"
            />
            <AvatarFallback>CN</AvatarFallback>
          </AvatarStyled> */}
        </div>
      </Cover>
    </>
  );
};

export default Profilephoto;

const Cover = styled.div`
  width: 100%;
  height: 100%;
  border-radius: 100%;
  background-color: #313338;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  cursor: pointer;
  div {
    width: 100%;
    height: 100%;
    img {
      width: 100%;
      height: 100%;
      border-radius: 100%;
      object-fit: cover;
    }
  }
  .Style {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    transform: scale(1.25);
    object-fit: cover;
  }
  .ProfileImage {
    width: 100%;
    height: 100%;
    border-radius: 100%;
    object-fit: cover;
  }
  .StatusMain {
    width: 100%;
    height: 100%;
    position: relative;
    top: 0;
    transform: scale(1.25);
    object-fit: cover;
  }
  .Status {
    width: 1.5rem;
    height: 2.5rem;
    position: absolute;
    border-radius: 100%;
    background-color: #2b2d31;
    display: flex;
    align-items: center;
    justify-content: center;

    img {
      width: 1rem;
      height: 1rem;
      border-radius: 100%;
      object-fit: cover;
    }
  }
`;

const AvatarStyled = styled(Avatar)`
  width: 30%;
  height: 30%;
  max-width: 2rem;
  max-height: 2rem;
  border-radius: 50%;
  position: absolute;
  bottom: 0;
  right: 0;

  border: ${(props) => props.borderWidth || "2px"} solid
    ${(props) => props.borderColor || "#111214"};
  background-color: #111214;
`;

const TextStyled = styled.h1`
  max-width: 4rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;
