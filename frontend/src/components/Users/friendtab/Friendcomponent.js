import React from "react";
import styled from "styled-components";
import Plus from "../../images/uploadsvg.svg";
import X from "../../images/X.svg";
import axios from "axios";
import { useSelector, useDispatch } from "react-redux";
import { setTrigger } from "@/Redux/sessionSlice";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";

const Friendcomponent = ({ user }) => {
  const dispatch = useDispatch();
  const usera = user?.users[0]?._id;
  const queryClient = useQueryClient();
  const deletetab = () => {
    axios
      .post(
        `/api/users/deleteuser/delete`,
        { userid: usera }, // Include the userid in the request body
        {
          withCredentials: true,
        }
      )
      .then((response) => {
        console.log(response.data);
        queryClient.invalidateQueries({ queryKey: ["directmessages"] });
      })
      .catch((error) => {
        console.log(error);
      });
  };
  return (
    <Cover>
      <div className="Profile">
        <Avatar>
          <AvatarImage
            src="https://bucket-88dwgz.s3.ap-south-1.amazonaws.com/bucket-88dwgz/Profilepicidsc.jpg"
            alt=""
          />
          <AvatarFallback>CN</AvatarFallback>
        </Avatar>
        <p>{user?.users[0]?.username}</p>
      </div>
      <div className="Buttondiv">
        <img onClick={deletetab} src={X} alt="" />
      </div>
    </Cover>
  );
};

export default Friendcomponent;

const Cover = styled.div`
  width: 100%;
  height: 2.5rem;
  display: flex;
  align-items: center;
  border-radius: 0.25rem;
  justify-content: space-between;
  gap: 4rem;
  .Profile {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 0.5rem;

    gap: 0.5rem;
    img {
      max-width: 2rem;
      max-height: 2rem;
      border-radius: 100%;
      object-fit: cover;
    }
    p {
      max-width: 3rem;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
  .Buttondiv {
    min-width: 2rem;
    margin-right: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;

    img {
      width: 1.5rem;
    }
  }
`;
